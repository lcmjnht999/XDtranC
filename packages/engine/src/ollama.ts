import type { ConversionRequest, LlmProvider } from './provider.js';
export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama'; readonly simulated = false;
  private readonly endpoint: string;
  constructor(readonly model: string, baseUrl = 'http://127.0.0.1:11434', private readonly timeoutMs = 120000) {
    if (!model.trim() || /\s/.test(model)) throw new Error('必须明确指定本机模型名');
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('仅允许无凭据的 HTTP 回环 IP 根地址');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) throw new Error('超时必须为 1～600000 毫秒');
    this.endpoint = new URL('/api/chat', url).href;
  }
  async generate(request: ConversionRequest, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, stream: false, format: 'json', options: { temperature: 0 }, messages: [
          { role: 'system', content: request.prompt },
          { role: 'user', content: JSON.stringify({ sources: request.sources, contextBundle: request.contextBundle, retryIssues: request.retryIssues }) }
        ] })
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Ollama HTTP ${response.status}；检查本机服务和模型是否已安装`); }
      if (!response.body) throw new Error('Ollama 返回空响应');
      const reader = response.body.getReader(); let length = 0; const parts: Uint8Array[] = [];
      try {
        while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 4 * 1024 * 1024) { await reader.cancel(); throw new Error('Ollama 响应超过 4 MiB'); } parts.push(value); }
      } finally { reader.releaseLock(); }
      let data;
      try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new Error('Ollama 响应不是有效 JSON'); }
      if (!data || data.done !== true || typeof data.message?.content !== 'string' || !data.message.content.trim()) throw new Error('Ollama 响应缺失完成标记或消息内容');
      return data.message.content;
    } catch (e) {
      signal?.throwIfAborted();
      if (controller.signal.aborted) throw new Error('Ollama 请求超时');
      if (e instanceof Error && e.message.startsWith('Ollama ')) throw e;
      throw new Error('Ollama 连接失败或重定向被拒绝；不会回退到其他 Provider');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
}