import { expect, test, vi } from 'vitest';
import { SessionKey } from './session-key.js';

const endpoint = 'https://example.invalid/v1';
const config = { provider: 'openai', endpoint, model: 'offline-model', timeoutMs: 1000 };
const secret = 'fixture-session-secret';

test('session secret is write-only, canonical-address bound, and construction makes no request', () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  try {
    const session = new SessionKey();
    expect(session.state(endpoint)).toEqual({ configured: false });
    expect(() => session.prepare(config)).toThrow('未配置');
    expect(session.set({ endpoint: 'HTTPS://EXAMPLE.INVALID:443/v1/', apiKey: secret })).toEqual({ configured: true });
    expect(session.state(endpoint)).toEqual({ configured: true });
    const provider = session.prepare(config);
    expect(provider.id).toBe('openai');
    expect(JSON.stringify([session, provider, session.state(endpoint)])).not.toContain(secret);
    for (const other of ['https://other.invalid/v1', 'https://example.invalid/v2', 'https://example.invalid:444/v1', 'https://example.invalid/V1', 'http://127.0.0.1/v1']) {
      expect(session.state(other)).toEqual({ configured: false });
      expect(() => session.prepare({ ...config, endpoint: other })).toThrow('未配置');
    }
    expect(() => session.prepare({ ...config, model: '' })).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
});

test('replace, clear and a new process session cannot reuse the old secret', () => {
  const session = new SessionKey();
  session.set({ endpoint, apiKey: secret });
  session.set({ endpoint: 'https://other.invalid/v1', apiKey: 'replacement-fixture' });
  expect(session.state(endpoint).configured).toBe(false);
  expect(session.state('https://other.invalid/v1').configured).toBe(true);
  expect(new SessionKey().state('https://other.invalid/v1').configured).toBe(false);
  expect(session.clear()).toEqual({ configured: false });
  expect(session.state('https://other.invalid/v1').configured).toBe(false);
  expect(() => session.prepare(config)).toThrow('未配置');
});

test('invalid submissions do not echo payloads or replace an existing key', () => {
  const session = new SessionKey();
  session.set({ endpoint, apiKey: secret });
  for (const payload of [null, [], {}, { endpoint, apiKey: '' }, { endpoint, apiKey: 42 },
    { endpoint, apiKey: 'bad\r\nkey' }, { endpoint, apiKey: 'x'.repeat(8193) },
    { endpoint: 'invalid-' + secret, apiKey: secret },
    ...['http://example.invalid/v1', 'https://example.invalid/v1/chat/completions', 'https://example.invalid/\nv1', `https://user:${secret}@example.invalid/v1`, `https://example.invalid/v1?key=${secret}`, `https://example.invalid/v1#${secret}`].map(endpoint => ({ endpoint, apiKey: secret })),
  ]) {
    expect(() => session.set(payload)).toThrow();
    try { session.set(payload); } catch (error) { expect(String(error)).not.toContain(secret); }
    expect(session.state(endpoint).configured).toBe(true);
  }
  expect(session.state(null)).toEqual({ configured: false });
});
