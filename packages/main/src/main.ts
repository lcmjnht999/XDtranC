import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep, extname } from 'node:path';
import { readFile, realpath, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseProject } from '../../engine/src/index.js';
import { chunkModel } from '../../engine/src/chunker.js';
import { convertChunks, type ConversionHooks, type ConversionReport } from '../../engine/src/converter.js';
import { Workspace, fingerprint, type TaskCheckpoint } from '../../engine/src/workspace.js';
import { parseConversionOutput, type ConversionOutput } from '../../shared/src/outputSchema.js';
import { desktopProvider } from './provider-config.js';
import { importZip, writeZip, scratchRoot, validateExportTarget } from '../../engine/src/archive.js';
import { exportReport, type ExportOptions } from '../../engine/src/exporter.js';
import { analyzeCoverage, businessStubStatus, type CoverageReport } from '../../engine/src/coverage.js';
import type { ProjectModel } from '../../shared/src/contracts.js';

interface WorkbenchSummary {
  inputFiles: number;
  inputLines: number;
  outputFiles: number;
  outputLines: number;
  lineRetention: number | null;
  coverage: CoverageReport;
  stubCheck: 'passed' | 'failed';
  failedChunks: number;
  unsupported: number;
  unassigned: number;
  simulated: boolean;
}

function buildSummary(model: ProjectModel, report: ConversionReport): WorkbenchSummary {
  const coverage = analyzeCoverage(model, report);
  const outputFiles = report.results.flatMap(item => item.output.outputs);
  const outputLines = outputFiles.reduce((total, item) => total + (item.code ? item.code.split(/\r\n|\n|\r/).length - (/\r?\n$|\r$/.test(item.code) ? 1 : 0) : 0), 0);
  const lineRetention = model.stats.lines ? outputLines / model.stats.lines : null;
  return {
    inputFiles: model.stats.files,
    inputLines: model.stats.lines,
    outputFiles: outputFiles.length,
    outputLines,
    lineRetention,
    coverage,
    stubCheck: businessStubStatus({ coverage, exportedFiles: outputFiles.length, failedChunks: report.failedChunks.length, lineRetention }),
    failedChunks: report.failedChunks.length,
    unsupported: report.unsupported.length,
    unassigned: report.unassigned.length,
    simulated: report.simulated,
  };
}

const base = dirname(fileURLToPath(import.meta.url));
const rendererRoot = resolve(base, 'renderer');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

async function serveRenderer(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = resolve(rendererRoot, '.' + relative);
  if (target !== rendererRoot && !target.startsWith(rendererRoot + sep)) return new Response('forbidden', { status: 403 });
  try {
    const bytes = await readFile(target);
    return new Response(new Uint8Array(bytes), { headers: { 'content-type': mimeTypes[extname(target).toLowerCase()] ?? 'application/octet-stream' } });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

let win: BrowserWindow;
let selected = '';
let active: AbortController | undefined;
let model: ProjectModel | undefined;
let report: ConversionReport | undefined;
let workspace: Workspace | undefined;
let task: TaskCheckpoint | undefined;
let lastSummary: WorkbenchSummary | undefined;

const status = (s: string) => win.webContents.send('project:status', s);

function register(channel: string, handler: (arg: unknown) => Promise<unknown>) {
  ipcMain.handle(channel, async (event, arg) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('非法 IPC 来源');
    return handler(arg);
  });
}

function exportOptions(raw: unknown): ExportOptions {
  if (!raw || typeof raw !== 'object') return {};
  const data = raw as Record<string, unknown>;
  if (data.cjpm !== undefined && typeof data.cjpm !== 'boolean') throw new Error('非法 CJPM 选项');
  if (data.packageName !== undefined && typeof data.packageName !== 'string') throw new Error('非法包名');
  const packageName = typeof data.packageName === 'string' ? data.packageName.trim() : '';
  return { cjpm: data.cjpm === true, packageName: packageName || undefined };
}

async function loadResume(ws: Workspace, checkpoint: TaskCheckpoint): Promise<Map<string, ConversionOutput>> {
  const cached = new Map<string, ConversionOutput>();
  for (const chunkId of checkpoint.completedChunks) {
    try {
      const raw = await ws.loadConversion(checkpoint.taskId, chunkId);
      if (raw === undefined) continue;
      cached.set(chunkId, parseConversionOutput(raw));
    } catch {
      // 损坏的缓存视为未完成，留待重新转换；不删除现场。
    }
  }
  return cached;
}

app.setAppUserModelId('com.xdtranc.desktop');

void app.whenReady().then(async () => {
  protocol.handle('app', serveRenderer);
  win = new BrowserWindow({ width: 1100, height: 780, webPreferences: { preload: resolve(base, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_w, _p, cb) => cb(false));

  register('project:choose', async kind => {
    if (active) throw new Error('任务执行中');
    if (kind !== 'dir' && kind !== 'zip') throw new Error('非法输入类型');
    const result = await dialog.showOpenDialog(win, { properties: kind === 'dir' ? ['openDirectory'] : ['openFile'], filters: kind === 'zip' ? [{ name: 'ZIP', extensions: ['zip'] }] : [] });
    if (result.canceled) return null;
    selected = result.filePaths[0];
    model = undefined; report = undefined; task = undefined; workspace = undefined; lastSummary = undefined;
    if (kind === 'dir') {
      const existing = await Workspace.inspect(selected).catch(() => undefined);
      const pending = existing ? await existing.listIncomplete().catch(() => []) : [];
      if (pending.length) status(`检测到 ${pending.length} 个未完成任务，再次运行将续跑`);
    }
    return selected;
  });

  register('project:cancel', async () => { active?.abort(); return true; });

  register('project:paste', async payload => {
    if (active) throw new Error('任务执行中');
    const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const name = typeof data.path === 'string' ? data.path.replace(/\\/g, '/') : '';
    const code = typeof data.code === 'string' ? data.code : '';
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(h|hpp|cpp|cc|cxx)$/i.test(name) || name.includes('..')) throw new Error('文件名必须是单个 C/C++ 文件，例如 pasted.cpp');
    if (!code.trim()) throw new Error('粘贴内容为空');
    if (Buffer.byteLength(code, 'utf8') > 512 * 1024) throw new Error('粘贴内容超过 512 KB');
    const dir = await mkdtemp(resolve(await scratchRoot(), 'paste-'));
    const source = resolve(dir, 'source');
    await mkdir(source);
    await writeFile(resolve(source, name), code, { flag: 'wx' });
    selected = source; model = undefined; report = undefined; task = undefined; workspace = undefined; lastSummary = undefined;
    return source;
  });

  register('project:run', async config => {
    if (active || !selected) throw new Error('请先选择输入且等待当前任务完成');
    active = new AbortController();
    model = undefined; report = undefined; task = undefined; workspace = undefined;
    const signal = active.signal;
    try {
      const provider = desktopProvider(config);
      status('解析中');
      const inputKind = selected.toLowerCase().endsWith('.zip') ? 'zip' : 'dir';
      const root = inputKind === 'zip' ? await importZip(selected, signal) : selected;
      const m = await parseProject(root, signal);
      const ws = await Workspace.open(m.root, { fallbackDir: app.getPath('userData') });
      workspace = ws;
      if (ws.degraded) status(`工作区降级到应用数据目录：${ws.dir}`);
      const inputHash = fingerprint(m);
      await ws.saveProject(m);
      status('切分中');
      const plan = await chunkModel(m, 4096, signal);
      await ws.saveChunks(plan);
      await ws.saveUnsupported([...m.unsupported, ...plan.unsupported, ...plan.unassigned]);

      let resume: Map<string, ConversionOutput> | undefined;
      const prior = await ws.findIncomplete(inputHash);
      if (prior && prior.budgetTokens === 4096) {
        task = prior;
        resume = await loadResume(ws, prior);
        task.stage = 'converting';
        task.chunkIds = plan.chunks.map(c => c.id);
        await ws.saveTask(task);
        await ws.appendEvent(task.taskId, { kind: 'task_resumed', cachedChunks: resume.size, totalChunks: plan.chunks.length });
        status(`续跑未完成任务：已完成 ${resume.size}/${plan.chunks.length} 块`);
      } else {
        task = await ws.createTask({ input: selected, inputKind, inputHash, provider: { id: provider.id, model: provider.model, simulated: provider.simulated }, budgetTokens: 4096 });
        task.stage = 'chunked';
        task.chunkIds = plan.chunks.map(c => c.id);
        await ws.saveTask(task);
        await ws.appendEvent(task.taskId, { kind: 'chunked', chunks: task.chunkIds.length });
      }

      const hooks: ConversionHooks = {
        onChunkComplete: async (chunkId, attempts, output) => {
          const current = task; const wsCurrent = workspace;
          if (!current || !wsCurrent) return;
          await wsCurrent.saveConversion(current.taskId, chunkId, { attempts, output });
          if (!current.completedChunks.includes(chunkId)) current.completedChunks.push(chunkId);
          await wsCurrent.saveTask(current);
          await wsCurrent.appendEvent(current.taskId, { kind: 'chunk_completed', chunkId, attempts });
        },
        onChunkFailed: async (chunkId, attempts, issues) => {
          const current = task; const wsCurrent = workspace;
          if (!current || !wsCurrent) return;
          current.failedChunks.push({ chunkId, attempts, issues });
          await wsCurrent.saveTask(current);
          await wsCurrent.appendEvent(current.taskId, { kind: 'chunk_failed', chunkId, attempts, issues });
        },
      };

      status(provider.simulated ? 'Mock 转换中' : 'Ollama 转换中');
      const r = await convertChunks(m, plan, provider, signal, hooks, resume);

      const previews: { path: string; code: string }[] = [];
      for (const f of m.files.slice(0, 20)) {
        signal.throwIfAborted(); const p = resolve(m.root, f.path);
        if (await realpath(p) !== p) throw new Error('预览路径变化');
        const b = await readFile(p);
        if (createHash('sha256').update(b).digest('hex') !== f.hash) throw new Error('预览源码变化');
        previews.push({ path: f.path, code: b.toString('utf8').slice(0, 20000) });
      }
      model = m; report = r;
      task.stage = 'converted';
      task.unsupported = r.unsupported;
      task.unassigned = r.unassigned;
      await ws.saveTask(task);
      await ws.saveReport(task.taskId, r);
      await ws.appendEvent(task.taskId, { kind: 'converted', status: r.status });
      lastSummary = buildSummary(m, r);
      const files = m.files.map(file => {
        const chunk = plan.chunks.find(item => item.files.includes(file.path));
        return {
          path: file.path,
          lines: file.lines,
          chunkId: chunk?.id ?? null,
          failed: r.failedChunks.some(item => item.chunkId === chunk?.id),
          unsupported: r.unsupported.some(item => item.sourcePath === file.path),
          outputs: (r.results.find(item => item.chunkId === chunk?.id)?.output.outputs ?? []).map(item => item.path),
        };
      });
      status(r.status === 'complete' ? (r.simulated ? '模拟完成' : '模型草稿完成（未验证编译）') : '部分完成，请检查问题');
      return { previews, report: r, files, summary: lastSummary };
    } catch (e) {
      const current = task; const wsCurrent = workspace;
      if (current && wsCurrent) {
        try {
          current.stage = signal.aborted ? 'cancelled' : 'failed';
          current.error = e instanceof Error ? e.message : String(e);
          await wsCurrent.saveTask(current);
          await wsCurrent.appendEvent(current.taskId, { kind: current.stage, error: current.error });
        } catch {
          // 不让状态写入失败覆盖原始错误。
        }
      }
      status(signal.aborted ? '已取消' : '失败');
      throw e;
    } finally {
      active = undefined;
    }
  });

  register('project:export', async payload => {
    const request = payload && typeof payload === 'object' ? payload as Record<string, unknown> : { format: payload };
    const format = request.format;
    if (format !== 'dir' && format !== 'zip') throw new Error('非法导出格式');
    const options = exportOptions(request.options);
    if (active || !model || !report) throw new Error('尚无可导出的结果');
    active = new AbortController();
    const signal = active.signal;
    try {
      const summary = lastSummary ?? buildSummary(model, report);
      const detail = [
        `输入文件：${summary.inputFiles}，输出文件：${summary.outputFiles}`,
        `行保留率：${summary.lineRetention === null ? '不可用' : `${(summary.lineRetention * 100).toFixed(1)}%`}`,
        `符号覆盖：${summary.coverage.mappedSymbols}/${summary.coverage.checkedSymbols}，未覆盖 ${summary.coverage.gaps.length}`,
        `空壳判定：${summary.stubCheck === 'passed' ? '通过' : '不通过'}`,
        `失败块：${summary.failedChunks}，不支持：${summary.unsupported}，未分配：${summary.unassigned}`,
        `目录布局：${options.cjpm ? 'CJPM 草稿（cjpm.toml 未用 cjc/CJPM 验证，结构待消费方确认）' : 'flat（无 CJPM 配置）'}`,
        '',
        '产物是未验证编译的草稿，是否继续导出？',
      ].join('\n');
      const answer = await dialog.showMessageBox(win, {
        type: summary.stubCheck === 'passed' ? 'question' : 'warning',
        buttons: ['继续导出', '取消'],
        defaultId: 0,
        cancelId: 1,
        title: '导出前确认',
        message: '完整性摘要',
        detail,
      });
      if (answer.response !== 0) return null;
      signal.throwIfAborted();
      const choice = await dialog.showSaveDialog(win, { title: '选择新的导出目标（不得已存在）', defaultPath: format === 'zip' ? 'draft.zip' : 'draft' });
      if (choice.canceled || !choice.filePath) return null;
      await validateExportTarget(selected, choice.filePath);
      await validateExportTarget(model.root, choice.filePath);
      status('导出中');
      let result;
      if (format === 'dir') {
        await mkdir(choice.filePath);
        result = await exportReport(model, report, resolve(choice.filePath, 'draft'), signal, options);
      } else {
        const stage = await mkdtemp(resolve(await scratchRoot(), 'desktop-export-'));
        const draft = resolve(stage, 'draft');
        result = await exportReport(model, report, draft, signal, options);
        await writeZip(draft, choice.filePath, signal);
      }
      if (task && workspace) {
        task.stage = 'exported';
        await workspace.saveTask(task);
        await workspace.appendEvent(task.taskId, { kind: 'exported', path: choice.filePath, status: result.status });
      }
      status('导出结束：' + result.status);
      return { path: choice.filePath, status: result.status, layout: result.layout };
    } catch (e) {
      status(signal.aborted ? '已取消' : '导出失败');
      throw e;
    } finally {
      active = undefined;
    }
  });

  await win.loadURL('app://xdtranc/index.html');
  win.on('closed', () => { active?.abort(); app.quit(); });
});
