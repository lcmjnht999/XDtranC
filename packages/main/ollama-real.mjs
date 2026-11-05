import { _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

// 真实 Ollama 验收：需要本机已经 ollama serve 且 ollama list 中存在 --model 指定的模型。
// 这个脚本不会下载模型、不会访问非回环地址，也不会回退 Mock。
const args = process.argv.slice(2);
const model = args.find(a => a.startsWith('--model='))?.slice('--model='.length);
const endpoint = args.find(a => a.startsWith('--endpoint='))?.slice('--endpoint='.length) ?? 'http://127.0.0.1:11434';
const timeoutMs = Number(args.find(a => a.startsWith('--timeout='))?.slice('--timeout='.length) ?? 120000);
if (!model) {
  console.error('用法：node packages/main/ollama-real.mjs --model=<ollama list 中的模型名> [--endpoint=http://127.0.0.1:11434] [--timeout=120000]');
  process.exit(1);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(endpoint)) {
  console.error('只允许回环地址，实际：' + endpoint);
  process.exit(1);
}

let tags;
try {
  const response = await fetch(endpoint + '/api/tags', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  tags = await response.json();
} catch (error) {
  console.error('无法连接本机 Ollama：' + endpoint + '（' + String(error) + '）\n请先运行 ollama serve。');
  process.exit(2);
}
const installed = (tags.models ?? []).map(m => m.name);
if (!installed.includes(model)) {
  console.error(`模型不在 ollama list 中：${model}\n已安装：${installed.join(', ') || '（空）'}\n请先 ollama pull ${model}`);
  process.exit(2);
}

await mkdir('.deepworks/tmp', { recursive: true });
const temp = await mkdtemp(resolve('.deepworks/tmp/ollama-real-'));
const started = Date.now();
const app = await electron.launch({ args: ['packages/main/dist/main.mjs'], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }, timeout: 30000 });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  await page.getByRole('heading', { name: 'XDtranC 工作台' }).waitFor();
  await app.evaluate(({ dialog }, payload) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [payload.input] });
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: payload.output });
  }, { input: resolve('samples/hello'), output: join(temp, 'draft-out') });
  await page.getByRole('button', { name: '选择目录' }).click();
  await page.getByLabel('转换方式').selectOption('ollama');
  await page.getByLabel('已安装模型').fill(model);
  await page.getByLabel('地址').fill(endpoint);
  await page.getByLabel('超时毫秒').fill(String(timeoutMs));
  await page.getByRole('button', { name: '开始转换' }).click();
  await page.waitForFunction(() => {
    const text = document.querySelector('[role=status]')?.textContent ?? '';
    return text.includes('模型草稿完成') || text.includes('部分完成') || text.includes('失败');
  }, { timeout: timeoutMs + 60000 });
  const status = (await page.getByRole('status').innerText()).trim();
  const issues = await page.locator('pre.issues').count() ? await page.locator('pre.issues').innerText() : '';
  const error = await page.locator('pre.error').count() ? await page.locator('pre.error').innerText() : '';
  const target = join(temp, 'draft-out');
  let manifest = null;
  const exportButton = page.getByRole('button', { name: '导出目录' });
  if (!(await exportButton.isDisabled())) {
    await exportButton.click();
    await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent?.includes('导出结束'));
    manifest = JSON.parse(await readFile(join(target, 'draft', 'export-manifest.json'), 'utf8'));
  }
  const elapsed = Math.round((Date.now() - started) / 1000);
  const report = {
    model,
    endpoint,
    status,
    elapsedSeconds: elapsed,
    error: error || null,
    issues: issues || null,
    manifest: manifest && {
      status: manifest.status,
      providerId: manifest.providerId,
      model: manifest.model,
      simulated: manifest.simulated,
      exportedFileCount: manifest.exportedFileCount,
      failedChunks: manifest.failedChunks.length,
      unsupported: manifest.unsupported.length,
      lineRetentionRatio: manifest.lineRetentionRatio,
    },
    exportTarget: manifest ? join(target, 'draft') : null,
  };
  console.log(JSON.stringify(report, null, 2));
  if (manifest) {
    assert.equal(manifest.providerId, 'ollama');
    assert.equal(manifest.model, model);
    assert.equal(manifest.simulated, false);
  }
  if (status.includes('失败') || error) process.exitCode = 1;
  else if (!manifest || manifest.status !== 'complete') process.exitCode = 2;
} finally {
  await app.close();
}
