import { appendFile, lstat, mkdir, readFile, rename, readdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { platform } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import type { ChunkResult, Issue, ProjectModel } from '@xdtranc/shared';

export const WORKSPACE_DIR = '.xdtranc';
export const WORKSPACE_VERSION = 1 as const;

export type TaskStage = 'imported' | 'parsed' | 'chunked' | 'converting' | 'converted' | 'exported' | 'failed' | 'cancelled';

export interface TaskCheckpoint {
  version: typeof WORKSPACE_VERSION;
  taskId: string;
  input: string;
  inputKind: 'dir' | 'zip';
  inputHash: string;
  projectRoot: string;
  stage: TaskStage;
  provider: { id: string; model: string; simulated: boolean };
  budgetTokens: number;
  createdAt: string;
  updatedAt: string;
  chunkIds: string[];
  completedChunks: string[];
  failedChunks: { chunkId: string; attempts: number; issues: string[] }[];
  unsupported: Issue[];
  unassigned: Issue[];
  error?: string;
}

export interface OpenOptions {
  /** 项目目录不可写时，用于降级存放工作区的应用数据目录。 */
  fallbackDir?: string;
}

const taskIdPattern = /^task-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const chunkIdPattern = /^chunk-\d{4}$/;
const renameRetryDelaysMs = [50, 100, 200, 400, 800] as const;
const retryableRenameCodes = new Set(['EPERM', 'EACCES', 'EBUSY']);

const inside = (root: string, target: string): boolean => {
  const rel = relative(root, target);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
};

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function errorCode(error: unknown): string | undefined {
  if (error instanceof Error && 'code' in error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

async function statOrUndefined(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined;
    throw error;
  }
}

/** 输入内容指纹：只取路径与内容 hash，与解析细节无关。 */
export function fingerprint(model: ProjectModel): string {
  const files = [...model.files]
    .map(file => [file.path, file.hash] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

export class Workspace {
  private constructor(
    readonly projectRoot: string,
    readonly dir: string,
    readonly degraded: boolean,
  ) {}

  /** 只读检查现有工作区；不存在或不可用时返回 undefined，不创建任何目录。 */
  static async inspect(projectRoot: string): Promise<Workspace | undefined> {
    let root: string;
    try {
      root = await realpath(resolve(projectRoot));
    } catch {
      return undefined;
    }
    const dir = resolve(root, WORKSPACE_DIR);
    const stat = await statOrUndefined(dir);
    if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) return undefined;
    return new Workspace(root, dir, false);
  }

  static async open(projectRoot: string, options: OpenOptions = {}): Promise<Workspace> {
    let root: string;
    try {
      root = await realpath(resolve(projectRoot));
    } catch {
      throw new Error('项目目录不存在或不可访问');
    }
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory()) throw new Error('项目根不是目录');
    const dir = resolve(root, WORKSPACE_DIR);
    const existing = await statOrUndefined(dir);
    if (existing) {
      if (existing.isSymbolicLink()) throw new Error('工作区目录不得是符号链接');
      if (!existing.isDirectory()) throw new Error(`工作区路径已被非目录占用：${dir}`);
      return new Workspace(root, dir, false);
    }
    try {
      await mkdir(dir);
      return new Workspace(root, dir, false);
    } catch (error) {
      if (!options.fallbackDir) throw new Error(`无法创建工作区：${message(error)}`);
      const alt = resolve(options.fallbackDir, 'workspaces', createHash('sha256').update(root).digest('hex').slice(0, 16));
      await mkdir(alt, { recursive: true });
      return new Workspace(root, alt, true);
    }
  }

  private path(rel: string): string {
    const target = resolve(this.dir, rel);
    if (!inside(this.dir, target)) throw new Error(`工作区路径越界：${rel}`);
    return target;
  }

  private async assertSafeParents(target: string): Promise<void> {
    const root = await lstat(this.dir);
    if (root.isSymbolicLink()) throw new Error('工作区目录不得是符号链接');
    if (!root.isDirectory()) throw new Error('工作区路径已被非目录占用');
    const parts = relative(this.dir, dirname(target)).split(sep).filter(Boolean);
    let current = this.dir;
    for (const part of parts) {
      current = resolve(current, part);
      const stat = await statOrUndefined(current);
      if (!stat) return;
      if (stat.isSymbolicLink()) throw new Error('工作区路径包含符号链接');
      if (!stat.isDirectory()) throw new Error('工作区路径包含非目录');
    }
  }

  async writeJson(rel: string, value: unknown): Promise<void> {
    const target = this.path(rel);
    if (target === this.dir) throw new Error('工作区写入目标必须是文件路径');
    const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    let temporaryCreated = false;
    try {
      const json = JSON.stringify(value, null, 2);
      await this.assertSafeParents(target);
      await mkdir(dirname(target), { recursive: true });
      await this.assertSafeParents(target);
      await writeFile(tmp, json, { encoding: 'utf8', flag: 'wx' });
      temporaryCreated = true;
      for (let retries = 0; ; retries++) {
        // Paths may have changed while waiting for a Windows file lock to clear.
        await this.assertSafeParents(target);
        const temporary = await lstat(tmp);
        if (!temporary.isFile() || temporary.isSymbolicLink()) throw new Error('工作区临时文件不是普通文件');
        const existing = await statOrUndefined(target);
        if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error('工作区目标不是普通文件');
        try {
          await rename(tmp, target);
          return;
        } catch (error) {
          const code = errorCode(error);
          if (platform !== 'win32' || !code || !retryableRenameCodes.has(code)) throw error;
          const waitMs = renameRetryDelaysMs[retries];
          if (waitMs === undefined) {
            throw new Error(`文件替换失败（${code}，已重试 ${retries} 次）；请关闭占用文件的程序或检查目录权限后重试`, { cause: error });
          }
          await delay(waitMs);
        }
      }
    } catch (error) {
      if (temporaryCreated) {
        try {
          await this.assertSafeParents(target);
          const temporary = await lstat(tmp);
          if (temporary.isFile() && !temporary.isSymbolicLink()) await unlink(tmp);
        } catch {
          // A changed boundary or locked temporary file is preserved for diagnosis.
        }
      }
      throw new Error(`工作区写入失败（${rel}）：${message(error)}`, { cause: error });
    }
  }

  async readJson<T>(rel: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(this.path(rel), 'utf8')) as T;
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return undefined;
      if (error instanceof SyntaxError) throw new Error(`工作区 JSON 损坏：${rel}`);
      throw error;
    }
  }

  async appendEvent(taskId: string, event: Record<string, unknown>): Promise<void> {
    this.assertTaskId(taskId);
    const target = this.path(`state/${taskId}/events.log.jsonl`);
    await this.assertSafeParents(target);
    await mkdir(dirname(target), { recursive: true });
    await this.assertSafeParents(target);
    const existing = await statOrUndefined(target);
    // Appending follows links and modifies the shared inode, unlike rename replacement.
    if (existing && (existing.isSymbolicLink() || !existing.isFile() || existing.nlink > 1)) {
      throw new Error('事件日志目标必须是无链接的普通文件');
    }
    await appendFile(target, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, 'utf8');
  }

  async createTask(params: {
    input: string;
    inputKind: 'dir' | 'zip';
    inputHash: string;
    provider: { id: string; model: string; simulated: boolean };
    budgetTokens: number;
  }): Promise<TaskCheckpoint> {
    const now = new Date().toISOString();
    const task: TaskCheckpoint = {
      version: WORKSPACE_VERSION,
      taskId: `task-${randomUUID()}`,
      input: params.input,
      inputKind: params.inputKind,
      inputHash: params.inputHash,
      projectRoot: this.projectRoot,
      stage: 'imported',
      provider: params.provider,
      budgetTokens: params.budgetTokens,
      createdAt: now,
      updatedAt: now,
      chunkIds: [],
      completedChunks: [],
      failedChunks: [],
      unsupported: [],
      unassigned: [],
    };
    await this.saveTask(task);
    await this.appendEvent(task.taskId, { kind: 'task_created', inputKind: task.inputKind });
    return task;
  }

  async saveTask(task: TaskCheckpoint): Promise<void> {
    this.assertTaskId(task.taskId);
    task.updatedAt = new Date().toISOString();
    await this.writeJson(`state/${task.taskId}/task.json`, task);
  }

  async loadTask(taskId: string): Promise<TaskCheckpoint | undefined> {
    this.assertTaskId(taskId);
    return this.readJson<TaskCheckpoint>(`state/${taskId}/task.json`);
  }

  async listTasks(): Promise<TaskCheckpoint[]> {
    let entries;
    try {
      entries = await readdir(this.path('state'), { withFileTypes: true });
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return [];
      throw error;
    }
    const tasks: TaskCheckpoint[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !taskIdPattern.test(entry.name)) continue;
      try {
        const task = await this.loadTask(entry.name);
        if (task && task.version === WORKSPACE_VERSION && task.taskId === entry.name) tasks.push(task);
      } catch {
        // 单个损坏任务不影响其他任务的恢复扫描，现场保留不删除。
      }
    }
    return tasks.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  async listIncomplete(): Promise<TaskCheckpoint[]> {
    return (await this.listTasks()).filter(task => !['converted', 'exported', 'failed', 'cancelled'].includes(task.stage));
  }

  async findIncomplete(inputHash: string): Promise<TaskCheckpoint | undefined> {
    return (await this.listIncomplete()).find(task => task.inputHash === inputHash);
  }

  async saveProject(model: ProjectModel): Promise<void> {
    await this.writeJson('model/project.json', model);
  }

  async saveChunks(plan: ChunkResult): Promise<void> {
    await this.writeJson('model/chunks.json', plan);
  }

  async saveUnsupported(issues: Issue[]): Promise<void> {
    await this.writeJson('model/unsupported.json', { issues });
  }

  async saveConversion(taskId: string, chunkId: string, record: { attempts: number; output: unknown }): Promise<void> {
    this.assertTaskId(taskId);
    if (!chunkIdPattern.test(chunkId)) throw new Error(`非法 chunkId：${chunkId}`);
    await this.writeJson(`state/${taskId}/conversions/${chunkId}.json`, record);
  }

  async loadConversion(taskId: string, chunkId: string): Promise<unknown | undefined> {
    this.assertTaskId(taskId);
    if (!chunkIdPattern.test(chunkId)) throw new Error(`非法 chunkId：${chunkId}`);
    const record = await this.readJson<{ output?: unknown }>(`state/${taskId}/conversions/${chunkId}.json`);
    return record?.output;
  }

  async saveReport(taskId: string, report: unknown): Promise<void> {
    this.assertTaskId(taskId);
    await this.writeJson(`reports/${taskId}/report.json`, report);
  }

  private assertTaskId(taskId: string): void {
    if (!taskIdPattern.test(taskId)) throw new Error(`非法 taskId：${taskId}`);
  }
}
