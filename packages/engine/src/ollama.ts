import { ProviderError, type ConversionRequest, type LlmProvider } from './provider.js';
const MAX_RETRY_AFTER_MS = 30000;
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_RETRY_AFTER_MS, Math.round(seconds * 1000));
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, at - Date.now()));
  return undefined;
}
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
      let response: Response;
      try {
        response = await fetch(this.endpoint, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: this.model, stream: false, format: 'json', options: { temperature: 0 }, messages: [
            { role: 'system', content: request.prompt },
            { role: 'user', content: JSON.stringify({ sources: request.sources, contextBundle: request.contextBundle, retryIssues: request.retryIssues, ...(request.fragment ? { fragment: request.fragment } : {}) }) }
          ] })
        });
      } catch (e) {
        signal?.throwIfAborted();
        if (controller.signal.aborted) throw new ProviderError('timeout', 'Ollama 请求超时', true);
        if (e instanceof Error && /redirect/i.test(e.message)) throw new ProviderError('http', 'Ollama 重定向被拒绝；不会回退到其他 Provider', false);
        throw new ProviderError('network', 'Ollama 连接失败；不会回退到其他 Provider', true);
      }
      if (!response.ok) {
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
        await response.body?.cancel();
        const status = response.status;
        // 只把限流、超时和 5xx 视为可重试；其余 4xx 是配置或请求问题，重试没有意义。
        if (status === 429) throw new ProviderError('rate-limit', `Ollama HTTP 429 限流；检查本机服务负载`, true, retryAfterMs ?? 1000);
        if (status === 408 || status === 504) throw new ProviderError('timeout', `Ollama HTTP ${status} 请求超时`, true, retryAfterMs);
        if (status >= 500) throw new ProviderError('server', `Ollama HTTP ${status} 服务端错误；检查本机服务`, true, retryAfterMs);
        throw new ProviderError('http', `Ollama HTTP ${status}；检查本机服务和模型是否已安装`, false);
      }
      if (!response.body) throw new ProviderError('invalid-response', 'Ollama 返回空响应', false);
      const reader = response.body.getReader(); let length = 0; const parts: Uint8Array[] = [];
      try {
        while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 4 * 1024 * 1024) { await reader.cancel(); throw new ProviderError('invalid-response', 'Ollama 响应超过 4 MiB', false); } parts.push(value); }
      } finally { reader.releaseLock(); }
      let data;
      try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new ProviderError('invalid-response', 'Ollama 响应不是有效 JSON', false); }
      if (!data || data.done !== true || typeof data.message?.content !== 'string' || !data.message.content.trim()) throw new ProviderError('invalid-response', 'Ollama 响应缺失完成标记或消息内容', false);
      return data.message.content;
    } catch (e) {
      signal?.throwIfAborted();
      if (e instanceof ProviderError) throw e;
      if (controller.signal.aborted) throw new ProviderError('timeout', 'Ollama 请求超时', true);
      throw new ProviderError('network', 'Ollama 连接失败或响应异常；不会回退到其他 Provider', true);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
}
