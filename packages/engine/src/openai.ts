import { ProviderError, type ConversionRequest, type LlmProvider } from './provider.js';

const MAX_RETRY_AFTER_MS = 30000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_RETRY_AFTER_MS, Math.round(seconds * 1000));
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, at - Date.now()));
  return undefined;
}

export interface OpenAiProviderOptions {
  /** 非回环地址必须显式置 true；调用方应先完成外发确认。 */
  allowExternal?: boolean;
  timeoutMs?: number;
}

/**
 * OpenAI 兼容 Provider（/chat/completions）。
 * 密钥只保存在实例内，不写日志、不写报告、不随导出物带走。
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id = 'openai';
  readonly simulated = false;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    baseUrl: string,
    options: OpenAiProviderOptions = {},
  ) {
    if (!model.trim() || /\s/.test(model)) throw new Error('必须明确指定模型名，且不能包含空白');
    if (!apiKey.trim()) throw new Error('缺少 API Key');
    const url = new URL(baseUrl);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
      throw new Error('云端 Provider 必须使用 HTTPS；仅本地回环地址允许 HTTP');
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error('baseUrl 不允许包含凭据、查询参数或片段');
    }
    if (!loopback && options.allowExternal !== true) {
      throw new Error('非回环地址需要显式确认外发（allowExternal: true）');
    }
    const timeoutMs = options.timeoutMs ?? 120000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) {
      throw new Error('超时必须为 1～600000 毫秒');
    }
    this.timeoutMs = timeoutMs;
    this.endpoint = new URL(`${url.pathname.replace(/\/+$/, '')}/chat/completions`, url).href;
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
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0,
            stream: false,
            messages: [
              { role: 'system', content: request.prompt },
              {
                role: 'user',
                content: JSON.stringify({
                  sources: request.sources,
                  contextBundle: request.contextBundle,
                  retryIssues: request.retryIssues,
                  ...(request.fragment ? { fragment: request.fragment } : {}),
                }),
              },
            ],
          }),
        });
      } catch (e) {
        signal?.throwIfAborted();
        if (controller.signal.aborted) throw new ProviderError('timeout', '云端模型请求超时', true);
        if (e instanceof Error && /redirect/i.test(e.message)) {
          throw new ProviderError('http', '云端模型重定向被拒绝；不会回退到其他 Provider', false);
        }
        throw new ProviderError('network', '云端模型连接失败；不会回退到其他 Provider', true);
      }

      if (!response.ok) {
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
        await response.body?.cancel();
        const status = response.status;
        if (status === 429) throw new ProviderError('rate-limit', '云端模型 HTTP 429 限流', true, retryAfterMs ?? 1000);
        if (status === 408 || status === 504) throw new ProviderError('timeout', `云端模型 HTTP ${status} 请求超时`, true, retryAfterMs);
        if (status >= 500) throw new ProviderError('server', `云端模型 HTTP ${status} 服务端错误`, true, retryAfterMs);
        if (status === 401 || status === 403) throw new ProviderError('http', `云端模型 HTTP ${status} 鉴权失败；检查 API Key 与权限`, false);
        throw new ProviderError('http', `云端模型 HTTP ${status}；检查 baseUrl、模型名与网关配置`, false);
      }

      if (!response.body) throw new ProviderError('invalid-response', '云端模型返回空响应', false);
      const reader = response.body.getReader();
      let length = 0;
      const parts: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new ProviderError('invalid-response', '云端模型响应超过 4 MiB', false);
          }
          parts.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      let data: unknown;
      try {
        data = JSON.parse(Buffer.concat(parts).toString('utf8'));
      } catch {
        throw new ProviderError('invalid-response', '云端模型响应不是有效 JSON', false);
      }
      const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new ProviderError('invalid-response', '云端模型响应缺少 choices[0].message.content', false);
      }
      return content;
    } catch (e) {
      signal?.throwIfAborted();
      if (e instanceof ProviderError) throw e;
      if (controller.signal.aborted) throw new ProviderError('timeout', '云端模型请求超时', true);
      throw new ProviderError('network', '云端模型连接失败或响应异常；不会回退到其他 Provider', true);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}
