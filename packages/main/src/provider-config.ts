import { OpenAiCompatibleProvider } from '../../engine/src/openai.js';
import { MockProvider } from '../../engine/src/provider.js';
import { OllamaProvider } from '../../engine/src/ollama.js';
import { validateApiConnection } from '../../shared/src/apiConfig.js';
export function desktopProvider(value: unknown, cloud?: { apiKey: string; approved: boolean }) {
  if (value === undefined) return new MockProvider();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('非法 Provider 配置');
  const v = value as Record<string, unknown>;
  if (v.provider === 'mock') return new MockProvider();
  if (v.provider === 'openai') {
    if (!cloud?.approved) throw new Error('云端外发需要主进程确认');
    const validation = validateApiConnection(v);
    if (!validation.ok) throw new Error(validation.issues.map(issue => issue.message).join('；'));
    const { model, endpoint, timeoutMs } = validation.config;
    return new OpenAiCompatibleProvider(model, cloud.apiKey, endpoint, { allowExternal: true, timeoutMs });
  }
  if (v.provider !== 'ollama' || typeof v.model !== 'string' || v.model.length > 200 || typeof v.endpoint !== 'string' || v.endpoint.length > 256 || typeof v.timeoutMs !== 'number') throw new Error('请提供有效的本机模型、地址和超时');
  return new OllamaProvider(v.model, v.endpoint, v.timeoutMs);
}
