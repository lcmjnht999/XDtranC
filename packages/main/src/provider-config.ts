import { MockProvider } from '../../engine/src/provider.js';
import { OllamaProvider } from '../../engine/src/ollama.js';
export function desktopProvider(value: unknown) {
  if (value === undefined) return new MockProvider();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('非法 Provider 配置');
  const v = value as Record<string, unknown>;
  if (v.provider === 'mock') return new MockProvider();
  if (v.provider !== 'ollama' || typeof v.model !== 'string' || v.model.length > 200 || typeof v.endpoint !== 'string' || v.endpoint.length > 256 || typeof v.timeoutMs !== 'number') throw new Error('请提供有效的本机模型、地址和超时');
  return new OllamaProvider(v.model, v.endpoint, v.timeoutMs);
}