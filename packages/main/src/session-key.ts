import { parseApiEndpoint } from '../../shared/src/apiConfig.js';
import type { SessionKeyState } from '../../shared/src/desktopSession.js';
import { desktopProvider } from './provider-config.js';

/** Main-process lifetime only. Never serialize this object or return a secret over IPC. */
export class SessionKey {
  #endpoint = '';
  #key = '';

  set(payload: unknown): SessionKeyState {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('非法密钥配置');
    const input = payload as Record<string, unknown>;
    const endpoint = parseApiEndpoint(input.endpoint);
    if (typeof input.apiKey !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(input.apiKey)) {
      throw new Error('API Key 必须为非空可见 ASCII 字符，不能含空白，最多 8192 字符');
    }
    this.#endpoint = endpoint;
    this.#key = input.apiKey;
    return { configured: true };
  }

  state(endpoint: unknown): SessionKeyState {
    try { return { configured: !!this.#key && parseApiEndpoint(endpoint) === this.#endpoint }; }
    catch { return { configured: false }; }
  }

  clear(): SessionKeyState {
    this.#key = '';
    this.#endpoint = '';
    return { configured: false };
  }

  prepare(config: unknown) {
    const input = config as Record<string, unknown> | null;
    if (!this.state(input?.endpoint).configured) throw new Error('当前服务地址未配置会话 API Key，请先提交密钥');
    // Construction validates settings without making a request. Caller must confirm before generate.
    return desktopProvider(config, { apiKey: this.#key, approved: true });
  }
}
