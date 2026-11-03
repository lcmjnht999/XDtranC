import { it, expect } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer, type RequestListener } from 'node:http';
import { convertProject } from './converter.js';
import { OllamaProvider } from './ollama.js';
import type { ConversionRequest, LlmProvider } from './provider.js';

async function fixture(files: Record<string, string>) {
  const base = resolve('.deepworks/tmp'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'robust-'));
  for (const [path, content] of Object.entries(files)) await writeFile(join(root, path), content);
  return root;
}
async function server(handler: RequestListener, test: (url: string) => Promise<void>) {
  const s = createServer(handler);
  await new Promise<void>(r => s.listen(0, '127.0.0.1', r));
  const address = s.address(); if (!address || typeof address === 'string') throw new Error('no address');
  try { await test(`http://127.0.0.1:${address.port}`); }
  finally { s.closeAllConnections(); await new Promise<void>((r, j) => s.close(e => e ? j(e) : r())); }
}
const conversion = (path: string) => JSON.stringify({
  kind: 'conversion', outputs: [{ path, code: 'main() { return 0 }' }], unsupported: [],
  selfCheck: { passed: true, issues: [] }, explanation: '模拟服务器', confidence: 0,
});
const ollamaBody = (content: string) => JSON.stringify({ done: true, message: { content } });

it('429 退避重试后成功，重试次数与延迟可观测', async () => {
  let calls = 0;
  await server((req, res) => {
    req.resume(); req.on('end', () => {
      calls++;
      if (calls <= 2) { res.writeHead(429, { 'retry-after': '0' }); res.end('busy'); }
      else res.end(ollamaBody(conversion('a.cj')));
    });
  }, async url => {
    const delays: number[] = [];
    const root = await fixture({ 'a.cpp': 'int a;' });
    const r = await convertProject(root, new OllamaProvider('local', url), 4096, undefined, {
      retryPolicy: { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 8000 },
      sleep: async ms => { delays.push(ms); },
    });
    expect(r.status).toBe('complete'); expect(calls).toBe(3);
    expect(r.results[0].providerRetries).toBe(2);
    expect(r.retries.map(x => x.attempt)).toEqual([1, 2]);
    expect(r.retries.map(x => x.kind)).toEqual(['rate-limit', 'rate-limit']);
    expect(delays).toEqual([500, 1000]);
  });
});

it('429 重试耗尽后进入失败清单并保留最终原因', async () => {
  let calls = 0;
  await server((req, res) => {
    req.resume(); req.on('end', () => { calls++; res.writeHead(429, { 'retry-after': '0' }); res.end('busy'); });
  }, async url => {
    const root = await fixture({ 'a.cpp': 'int a;' });
    const r = await convertProject(root, new OllamaProvider('local', url), 4096, undefined, {
      retryPolicy: { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 8000 },
      sleep: async () => {},
    });
    expect(calls).toBe(3); expect(r.status).toBe('partial');
    expect(r.failedChunks[0].providerRetries).toBe(2);
    expect(r.failedChunks[0].issues.join('')).toContain('已重试 2 次');
    expect(r.failedChunks[0].issues.join('')).toContain('429');
    expect(r.retries).toHaveLength(2);
  });
});

it('504 超时可重试，非重试的 404 不消耗重试', async () => {
  let timeoutCalls = 0;
  await server((req, res) => {
    req.resume(); req.on('end', () => { timeoutCalls++; if (timeoutCalls === 1) { res.writeHead(504); res.end('slow'); } else res.end(ollamaBody(conversion('a.cj'))); });
  }, async url => {
    const root = await fixture({ 'a.cpp': 'int a;' });
    const r = await convertProject(root, new OllamaProvider('local', url), 4096, undefined, { sleep: async () => {} });
    expect(r.status).toBe('complete'); expect(r.results[0].providerRetries).toBe(1);
    expect(r.retries[0].kind).toBe('timeout');
  });
  let notFoundCalls = 0;
  await server((req, res) => {
    req.resume(); req.on('end', () => { notFoundCalls++; res.writeHead(404); res.end('missing'); });
  }, async url => {
    const root = await fixture({ 'a.cpp': 'int a;' });
    const r = await convertProject(root, new OllamaProvider('local', url), 4096, undefined, { sleep: async () => {} });
    expect(notFoundCalls).toBe(1); expect(r.failedChunks[0].providerRetries).toBe(0);
  });
});

it('超长 chunk 自动按行缩块并合并输出', async () => {
  const lines = Array.from({ length: 200 }, (_, i) => `int value_${i} = ${i};`);
  const root = await fixture({ 'a.cpp': `${lines.join('\n')}\n` });
  const provider: LlmProvider = {
    id: 'split', model: 'split-v1', simulated: true,
    async generate(request: ConversionRequest) {
      if (!request.fragment) throw new Error('超长块必须先缩块');
      return {
        kind: 'conversion', outputs: [{ path: `part-${request.fragment.index}.cj`, code: 'main() { return 0 }' }],
        unsupported: [], selfCheck: { passed: true, issues: [] }, explanation: '分片模拟', confidence: 0,
      };
    },
  };
  const r = await convertProject(root, provider, 1000, undefined, { sleep: async () => {} });
  expect(r.status).toBe('complete'); expect(r.splits).toHaveLength(1);
  expect(r.splits[0].parts).toBeGreaterThan(1);
  expect(r.results[0].output.outputs).toHaveLength(r.splits[0].parts);
  expect(new Set(r.results[0].output.outputs.map(o => o.path)).size).toBe(r.splits[0].parts);
  expect(r.results[0].attempts).toBe(r.splits[0].parts);
  expect(r.failedChunks).toHaveLength(0);
});

it('无法缩块的单行超预算进入失败清单', async () => {
  const root = await fixture({ 'a.cpp': `int value = 0; /* ${'x'.repeat(2000)} */\n` });
  const provider: LlmProvider = {
    id: 'never', model: 'never-v1', simulated: true,
    async generate() { throw new Error('不应调用 Provider'); },
  };
  const r = await convertProject(root, provider, 1000, undefined, { sleep: async () => {} });
  expect(r.status).toBe('partial'); expect(r.splits).toHaveLength(0);
  expect(r.failedChunks[0].issues[0]).toContain('无法按行缩块');
});

it('退避等待中取消立即结束', async () => {
  await server((req, res) => {
    req.resume(); req.on('end', () => { res.writeHead(429, { 'retry-after': '0' }); res.end('busy'); });
  }, async url => {
    const controller = new AbortController();
    const root = await fixture({ 'a.cpp': 'int a;' });
    const pending = convertProject(root, new OllamaProvider('local', url), 4096, controller.signal, {
      sleep: (ms, signal) => new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('sleep 未取消')), ms);
        signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('已取消', 'AbortError')); }, { once: true });
      }),
    });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
