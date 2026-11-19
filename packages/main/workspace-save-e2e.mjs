import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron as electron } from '@playwright/test';

await mkdir('.deepworks/tmp', { recursive: true });
const temp = await mkdtemp(resolve('.deepworks/tmp/workspace-save-e2e-'));
const source = join(temp, 'source');
await cp(resolve('samples/hello'), source, {
  recursive: true,
  filter: path => !path.replace(/\\/g, '/').split('/').includes('.xdtranc'),
});

let app;
try {
  app = await electron.launch({
    args: ['packages/main/dist/main.mjs'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, XDTRAN_API_KEY: undefined },
    timeout: 30000,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.getByRole('heading', { name: 'XDtranC 工作台' }).waitFor();
  assert.equal(await page.getByLabel('转换方式').inputValue(), 'mock');
  await app.evaluate(async ({ dialog }, input) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
    globalThis.fetch = async () => { throw new Error('Offline test blocks all model requests'); };
    const fs = process.getBuiltinModule('node:fs/promises');
    const { syncBuiltinESMExports } = process.getBuiltinModule('node:module');
    const original = fs.rename;
    const state = { mode: 'transient', injected: 0, checkpointTarget: '', retries: 0 };
    globalThis.workspaceSaveFixture = state;
    // Inject native-style rename errors in the real main-process save path.
    fs.rename = async (from, to) => {
      const path = String(to).replace(/\\/g, '/');
      if (state.mode === 'transient' && /\/state\/task-[^/]+\/task\.json$/.test(path)) {
        if (!state.checkpointTarget) state.checkpointTarget = String(to);
        if (String(to) === state.checkpointTarget) {
          state.retries++;
          if (state.injected < 2) {
            state.injected++;
            throw Object.assign(new Error('fixture file temporarily in use'), { code: 'EPERM' });
          }
        }
      }
      if (state.mode === 'persistent' && /\/reports\/task-[^/]+\/report\.json$/.test(path)) {
        state.injected++;
        throw Object.assign(new Error('fixture file remains in use'), { code: 'EPERM' });
      }
      return original(from, to);
    };
    syncBuiltinESMExports();
  }, source);

  await page.getByRole('button', { name: '选择目录' }).click();
  const run = async () => {
    await page.getByRole('button', { name: '开始转换' }).click();
    await page.waitForFunction(() => document.querySelector('button.primary')?.disabled === false);
  };
  await run();
  assert.equal(await page.locator('pre.error').count(), 0);
  assert.equal(await page.getByRole('status').innerText(), '模拟完成');
  const transient = await app.evaluate(() => globalThis.workspaceSaveFixture);
  assert.equal(transient.injected, 2);
  assert.ok(transient.retries >= 3);
  const saved = JSON.parse(await readFile(transient.checkpointTarget, 'utf8'));
  assert.equal(saved.stage, 'converted');
  assert.equal(saved.completedChunks.length, 2);

  await app.evaluate(() => {
    globalThis.workspaceSaveFixture.mode = 'persistent';
    globalThis.workspaceSaveFixture.injected = 0;
  });
  await run();
  assert.equal(await page.getByRole('status').innerText(), '失败');
  assert.match(await page.locator('pre.error').innerText(), /已重试 5 次/);
  assert.equal(await page.getByRole('button', { name: '导出目录' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '导出 ZIP' }).isDisabled(), true);
  assert.equal(await app.evaluate(() => globalThis.workspaceSaveFixture.injected), 6);
  const checkpoints = [];
  for (const task of await readdir(join(source, '.xdtranc', 'state'))) {
    checkpoints.push(JSON.parse(await readFile(join(source, '.xdtranc', 'state', task, 'task.json'), 'utf8')));
  }
  const failed = checkpoints.find(task => task.stage === 'failed');
  assert.ok(failed);
  assert.match(failed.error, /已重试 5 次/);
  await assert.rejects(readFile(join(source, '.xdtranc', 'reports', failed.taskId, 'report.json')), { code: 'ENOENT' });

  await app.evaluate(() => { globalThis.workspaceSaveFixture.mode = 'success'; });
  await run();
  assert.equal(await page.getByRole('status').innerText(), '模拟完成');
  assert.equal(await page.locator('pre.error').count(), 0);
  assert.equal(await page.getByRole('button', { name: '导出目录' }).isDisabled(), false);
  await page.screenshot({ path: join(temp, 'success.png') });
  console.log('通过：开发版 Electron 的工作区 EPERM 两次后恢复、持续占用六次后明确失败并禁止导出、解除占用后再次成功。仅 Mock，未调用真实 API。截图：' + join(temp, 'success.png'));
} finally {
  if (app) await app.close();
}
