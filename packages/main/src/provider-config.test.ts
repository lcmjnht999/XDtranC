import { test, expect } from 'vitest';
import { desktopProvider } from './provider-config.js';
import { validateApiConnection } from '../../shared/src/apiConfig.js';
test('桌面默认模拟且显式选择本机模型',()=>{expect(desktopProvider(undefined).simulated).toBe(true);expect(desktopProvider({provider:'ollama',model:'test-model',endpoint:'http://127.0.0.1:11434',timeoutMs:1000}).simulated).toBe(false);});
test('拒绝非法配置，不回退模拟',()=>{for(const v of [null,[],{provider:'cloud'},{provider:'ollama',model:'',endpoint:'http://127.0.0.1:11434',timeoutMs:10},{provider:'ollama',model:'m',endpoint:'https://example.com',timeoutMs:10},{provider:'ollama',model:'m',endpoint:'http://127.0.0.1:11434',timeoutMs:0}])expect(()=>desktopProvider(v)).toThrow();});
test('cloud requires trusted approval and key without exposing secrets', () => {
  const config = { provider: 'openai', model: 'test', endpoint: 'https://example.invalid/v1', timeoutMs: 1000 };
  expect(() => desktopProvider(config)).toThrow();
  expect(() => desktopProvider({ ...config, allowExternal: true })).toThrow();
  expect(() => desktopProvider(config, { apiKey: '', approved: true })).toThrow();
  expect(desktopProvider(config, { apiKey: 'test-only', approved: true }).id).toBe('openai');
});

test('main-process validation rejects the same invalid fields even when renderer controls are bypassed', () => {
  const config = { provider: 'openai', model: 'offline-model', endpoint: 'https://example.invalid/v1', timeoutMs: 1000 };
  for (const patch of [{ model: '' }, { model: 'bad model' }, { timeoutMs: 0 }, { timeoutMs: 1.5 },
    { endpoint: 'https://example.invalid/v1/chat/completions' }, { endpoint: 'https://user:fake-secret@example.invalid/v1' },
  ]) {
    const input = { ...config, ...patch };
    const validation = validateApiConnection(input);
    expect(validation.ok).toBe(false);
    if (validation.ok) throw new Error('expected invalid fixture');
    expect(() => desktopProvider(input, { approved: true, apiKey: 'fake-secret' })).toThrow(validation.issues[0].message);
  }
});
