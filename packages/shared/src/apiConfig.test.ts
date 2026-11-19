import { expect, test } from 'vitest';
import { normalizeOpenAiBaseUrl, parseApiEndpoint, validateApiConnection } from './apiConfig.js';

const valid = { model: 'org/offline-model:v1', endpoint: 'https://example.invalid/v1', timeoutMs: 120000 };

test('valid settings normalize only the base URL and discard unrelated fields including keys', () => {
  const result = validateApiConnection({ ...valid, endpoint: ' HTTPS://EXAMPLE.INVALID:443/v1/ ', apiKey: 'fake-only-secret' });
  expect(result).toEqual({ ok: true, config: { ...valid, endpoint: 'https://example.invalid/v1/' } });
  expect(JSON.stringify(result)).not.toContain('fake-only-secret');
  expect(parseApiEndpoint('http://127.0.0.1:11434/v1')).toBe('http://127.0.0.1:11434/v1/');
});

test('invalid settings return field-specific issues without reflecting raw inputs', () => {
  const result = validateApiConnection({ model: 'fake-only-secret bad', endpoint: 'https://user:fake-only-secret@example.invalid/v1', timeoutMs: 1.5 });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected invalid fixture');
  expect(result.issues.map(issue => issue.field)).toEqual(['model', 'endpoint', 'timeoutMs']);
  expect(JSON.stringify(result)).not.toContain('fake-only-secret');
});

test('model IDs and integer timeout bounds match desktop constraints', () => {
  for (const model of ['', ' ', 'bad model', 'bad\nmodel', 'bad\0model', 'x'.repeat(201), null, 123]) {
    const result = validateApiConnection({ ...valid, model });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map(issue => issue.field)).toContain('model');
  }
  for (const timeoutMs of [0, -1, 1.5, 600001, NaN, Infinity, '1000', null]) {
    const result = validateApiConnection({ ...valid, timeoutMs });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map(issue => issue.field)).toContain('timeoutMs');
  }
  expect(validateApiConnection({ ...valid, model: 'x'.repeat(200), timeoutMs: 1 }).ok).toBe(true);
  expect(validateApiConnection({ ...valid, timeoutMs: 600000 }).ok).toBe(true);
  for (const value of [null, [], 'invalid']) expect(validateApiConnection(value).ok).toBe(false);
});

test('base URL rejects credentials, queries, fragments, control characters and a full completions URL', () => {
  for (const endpoint of ['', 'invalid-fake-only-secret', 'http://example.invalid/v1',
    'https://user:fake-only-secret@example.invalid/v1', 'https://example.invalid/v1?key=fake-only-secret',
    'https://example.invalid/v1#fake-only-secret', 'https://example.invalid/\nv1', 'https://example.invalid/' + 'x'.repeat(256),
    'https://example.invalid/v1/chat/completions', 'https://example.invalid/v1/chat/completions/',
  ]) {
    expect(() => parseApiEndpoint(endpoint)).toThrow();
    const result = validateApiConnection({ ...valid, endpoint });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('fake-only-secret');
  }
});

test('normalization preserves approved host, base path case and double-slash path identity', () => {
  expect(normalizeOpenAiBaseUrl('https://approved.invalid//other.invalid/v1')).toBe('https://approved.invalid//other.invalid/v1/');
  expect(parseApiEndpoint('https://example.invalid/V1')).not.toBe(parseApiEndpoint(valid.endpoint));
  expect(parseApiEndpoint('https://example.invalid:444/v1')).not.toBe(parseApiEndpoint(valid.endpoint));
});
