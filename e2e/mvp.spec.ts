import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as string;
const repositoryRoot = resolve(import.meta.dirname, '..');
const packagedExecutable = resolve(repositoryRoot, 'release/win-unpacked/XDtranC.exe');

async function launchDevelopment(): Promise<ElectronApplication> {
  return electron.launch({
    args: [resolve(repositoryRoot, 'packages/main/dist/main.mjs')],
    executablePath: electronPath,
  });
}

async function journey(app: ElectronApplication, input: string, exportTarget: string, cjpm = false) {
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'XDtranC 工作台' })).toBeVisible();

  // 原生对话框无法由 Playwright 点击，改为在主进程替换 dialog 方法；仍是真实 IPC 与导出链路。
  await app.evaluate(async ({ dialog }, payload) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [payload.input], bookmarks: [] });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: payload.output, bookmark: '' });
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  }, { input, output: exportTarget });

  await page.getByRole('button', { name: '选择目录' }).click();
  await expect(page.getByText(input, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '开始转换' }).click();
  await expect(page.getByRole('status')).toContainText('模拟完成', { timeout: 90_000 });
  await expect(page.getByText('本次结果：Mock 模拟', { exact: false })).toBeVisible();

  if (cjpm) await page.getByLabel(/生成 cjpm\.toml/).check();
  await page.getByRole('button', { name: '导出目录' }).click();
  await expect(page.getByRole('status')).toContainText('导出结束：complete', { timeout: 90_000 });

  await access(resolve(exportTarget, 'draft/export-manifest.json'));
  const manifest = JSON.parse(await readFile(resolve(exportTarget, 'draft/export-manifest.json'), 'utf8')) as { status: string; simulated: boolean; exportedFileCount: number; layout: string };
  expect(manifest.status).toBe('complete');
  expect(manifest.simulated).toBe(true);
  expect(manifest.exportedFileCount).toBe(2);
  expect(manifest.layout).toBe(cjpm ? 'cjpm' : 'flat');
  await access(resolve(exportTarget, 'draft/src/main.cj'));
  await access(resolve(exportTarget, 'draft/src/calculator.cj'));
  if (cjpm) {
    const toml = await readFile(resolve(exportTarget, 'draft/cjpm.toml'), 'utf8');
    expect(toml).toContain('name = "hello"');
    expect(toml).toContain('layout: xdtranc-cjpm-1');
  } else {
    await expect(access(resolve(exportTarget, 'draft/cjpm.toml'))).rejects.toThrow();
  }
}

async function scratch(name: string) {
  const root = resolve(repositoryRoot, '.deepworks/tmp', name);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  return root;
}

test('Mock 主旅程：选择目录 → 转换 → 导出目录', async () => {
  const dir = await scratch('e2e-main');
  const exportTarget = resolve(dir, 'draft-out');
  const input = resolve(repositoryRoot, 'samples/hello');
  const app = await launchDevelopment();
  try { await journey(app, input, exportTarget); }
  finally { await app.close(); }
});

test('打包产物启动并完成 Mock 主旅程（CJPM 草稿）', async () => {
  test.skip(!existsSync(packagedExecutable), '未找到 release/win-unpacked/XDtranC.exe，先运行 pnpm run pkg');
  const dir = await scratch('e2e-packaged');
  const exportTarget = resolve(dir, 'draft-out');
  const input = resolve(repositoryRoot, 'samples/hello');
  const app = await electron.launch({ executablePath: packagedExecutable });
  try { await journey(app, input, exportTarget, true); }
  finally { await app.close(); }
});
