import { resolve } from 'node:path';
import { exportProject } from './src/exporter.js';
import { OpenAiCompatibleProvider } from './src/openai.js';

function arg(name: string): string | undefined {
  const hit = process.argv.find(value => value.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const baseUrl = arg('base-url') ?? process.env.XDTRAN_BASE_URL ?? 'https://tokenhub.deepepexios.cn/gateway/api/v1';
const model = arg('model') ?? process.env.XDTRAN_MODEL ?? 'DeepSeek-V4.1-Flash';
const input = resolve(arg('input') ?? 'samples/hello');
const out = resolve(arg('out') ?? `.deepworks/tmp/cloud-${Date.now()}`);
const timeoutMs = Number(arg('timeout') ?? '300000');

function resolveKey(): string {
  const key = process.env.XDTRAN_API_KEY;
  if (!key || !key.trim()) {
    throw new Error('缺少 API Key：请先在当前终端设置 XDTRAN_API_KEY；脚本不会读取任何凭据文件');
  }
  return key;
}

const provider = new OpenAiCompatibleProvider(model, resolveKey(), baseUrl, { allowExternal: true, timeoutMs });
const started = Date.now();
const manifest = await exportProject(input, out, provider, 4096);

const summary = {
  baseUrl,
  model,
  output: out,
  elapsedSeconds: Math.round((Date.now() - started) / 1000),
  providerId: manifest.providerId,
  simulated: manifest.simulated,
  status: manifest.status,
  inputFileCount: manifest.inputFileCount,
  exportedFileCount: manifest.exportedFileCount,
  exportedFileRatio: manifest.exportedFileRatio,
  lineRetentionRatio: manifest.lineRetentionRatio,
  emptyFileCount: manifest.emptyFileCount,
  failedChunks: manifest.failedChunks.length,
  unsupported: manifest.unsupported.length,
  issues: manifest.failedChunks.map(chunk => ({ chunkId: chunk.chunkId, issues: chunk.issues })),
};

console.log(JSON.stringify(summary, null, 2));
if (manifest.status !== 'complete') process.exitCode = 1;
