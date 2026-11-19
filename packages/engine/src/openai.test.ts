import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleProvider } from './openai.js';
import { ProviderError } from './provider.js';

const servers: Server[] = [];

async function listen(handler: (req: IncomingMessage, res: ServerResponse, body: string) => void): Promise<string> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => handler(req, res, Buffer.concat(chunks).toString('utf8')));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('无法获取测试端口');
  return `http://127.0.0.1:${address.port}/v1`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  })));
});

const request = { prompt: 'p', sources: [{ path: 'a.cpp', code: 'int x;' }], contextBundle: [], retryIssues: [] };

describe('OpenAiCompatibleProvider', () => {
  it('double-slash base paths preserve the approved host and secrets stay out of serialized objects', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'fixture' } }] })));
    try {
      const provider = new OpenAiCompatibleProvider('m', 'fake-path-secret', 'https://approved.invalid//other.invalid/v1', { allowExternal: true });
      expect(JSON.stringify(provider)).not.toContain('fake-path-secret');
      await expect(provider.generate(request)).resolves.toBe('fixture');
      expect(fetch.mock.calls[0][0]).toBe('https://approved.invalid//other.invalid/v1/chat/completions');
      expect(fetch.mock.calls[0][1]?.redirect).toBe('error');
    } finally { fetch.mockRestore(); }
  });

  it('解析 choices[0].message.content，并发送 Bearer 鉴权与模型名', async () => {
    let seen = '';
    const base = await listen((req, res, body) => {
      seen = `${req.headers.authorization ?? ''}|${JSON.parse(body).model}`;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '{"kind":"conversion"}' } }] }));
    });
    const provider = new OpenAiCompatibleProvider('DeepSeek-V4.1-Flash', 'sk-test', base);
    await expect(provider.generate(request)).resolves.toBe('{"kind":"conversion"}');
    expect(seen).toBe('Bearer sk-test|DeepSeek-V4.1-Flash');
  });

  it('429 映射为可重试的 rate-limit', async () => {
    const base = await listen((_req, res) => {
      res.writeHead(429, { 'retry-after': '3' });
      res.end('{}');
    });
    const provider = new OpenAiCompatibleProvider('m', 'sk', base);
    await expect(provider.generate(request)).rejects.toMatchObject({ name: 'ProviderError', kind: 'rate-limit', retryable: true, retryAfterMs: 3000 });
  });

  it('redirects cannot forward the key to another service and error bodies are not exposed', async () => {
    let redirectedRequests = 0;
    const target = await listen((_req, res) => { redirectedRequests++; res.end('{}'); });
    const base = await listen((_req, res) => {
      res.writeHead(307, { location: target + '/chat/completions' });
      res.end('untrusted-fake-secret');
    });
    const provider = new OpenAiCompatibleProvider('m', 'untrusted-fake-secret', base);
    const error: unknown = await provider.generate(request).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ProviderError);
    expect(String(error)).not.toContain('untrusted-fake-secret');
    expect(redirectedRequests).toBe(0);
  });

  it('401 映射为不可重试的鉴权错误', async () => {
    const base = await listen((_req, res) => { res.writeHead(401); res.end('{}'); });
    const provider = new OpenAiCompatibleProvider('m', 'sk', base);
    await expect(provider.generate(request)).rejects.toMatchObject({ kind: 'http', retryable: false });
  });

  it('500 映射为可重试的 server', async () => {
    const base = await listen((_req, res) => { res.writeHead(500); res.end('{}'); });
    const provider = new OpenAiCompatibleProvider('m', 'sk', base);
    const error = await provider.generate(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind: 'server', retryable: true });
  });

  it('缺少 content 时拒绝，不返回空字符串', async () => {
    const base = await listen((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: {} }] }));
    });
    const provider = new OpenAiCompatibleProvider('m', 'sk', base);
    await expect(provider.generate(request)).rejects.toMatchObject({ kind: 'invalid-response', retryable: false });
  });

  it('非回环地址未显式确认时拒绝构造', () => {
    expect(() => new OpenAiCompatibleProvider('m', 'sk', 'https://example.com/v1')).toThrow('显式确认外发');
  });

  it('baseUrl 不允许携带查询参数或凭据', () => {
    expect(() => new OpenAiCompatibleProvider('m', 'sk', 'https://user:pass@example.com/v1', { allowExternal: true })).toThrow('不允许包含凭据');
    expect(() => new OpenAiCompatibleProvider('m', 'sk', 'https://example.com/v1?x=1', { allowExternal: true })).toThrow('不允许包含凭据');
  });
});
