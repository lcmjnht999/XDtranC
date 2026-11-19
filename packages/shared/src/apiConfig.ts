/** Pure connection validation shared by the desktop renderer, main process and adapter. */
export function normalizeOpenAiBaseUrl(baseUrl: string): string {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new Error('无效的 OpenAI 兼容 base URL'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('云端 Provider 必须使用 HTTPS；仅本地回环地址允许 HTTP');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('baseUrl 不允许包含凭据、查询参数或片段');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return url.href;
}

export function parseApiEndpoint(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) {
    throw new Error('请填写 base URL，最多 256 字符');
  }
  if (/[\x00-\x1f\x7f]/.test(value)) throw new Error('base URL 不能包含控制字符');
  const endpoint = normalizeOpenAiBaseUrl(value.trim());
  if (new URL(endpoint).pathname.endsWith('/chat/completions/')) {
    throw new Error('请填写 base URL，不要包含 /chat/completions');
  }
  return endpoint;
}

export interface ApiConnectionConfig {
  model: string;
  endpoint: string;
  timeoutMs: number;
}

export interface ApiConfigIssue {
  field: keyof ApiConnectionConfig;
  message: string;
}

export type ApiConfigValidation =
  | { ok: true; config: ApiConnectionConfig }
  | { ok: false; issues: ApiConfigIssue[] };

/** Messages never contain raw input, including credentials pasted into an invalid URL. */
export function validateApiConnection(value: unknown): ApiConfigValidation {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const issues: ApiConfigIssue[] = [];
  const model = typeof data.model === 'string' ? data.model : '';
  if (!model || model.length > 200 || /[\s\x00-\x1f\x7f]/.test(model)) {
    issues.push({ field: 'model', message: '请填写准确模型 ID，不能含空白或控制字符，最多 200 字符' });
  }
  let endpoint = '';
  try { endpoint = parseApiEndpoint(data.endpoint); }
  catch (error) { issues.push({ field: 'endpoint', message: error instanceof Error ? error.message : '无效的 base URL' }); }
  const timeoutMs = typeof data.timeoutMs === 'number' ? data.timeoutMs : NaN;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) {
    issues.push({ field: 'timeoutMs', message: '超时必须是 1～600000 毫秒的整数' });
  }
  return issues.length ? { ok: false, issues } : { ok: true, config: { model, endpoint, timeoutMs } };
}
