// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkbenchApi } from './types';

const mock = vi.hoisted(() => ({
  status: vi.fn(() => () => {}),
  sessionKeyStatus: vi.fn(), setSessionKey: vi.fn(), clearSessionKey: vi.fn(),
  choose: vi.fn(), run: vi.fn(),
}));
vi.mock('./api', () => ({ api: mock as unknown as WorkbenchApi }));
vi.mock('./components/CodeView', () => ({ CodeView: () => null }));
import { App } from './App';

beforeEach(() => {
  vi.clearAllMocks();
  mock.sessionKeyStatus.mockResolvedValue({ configured: false });
  mock.setSessionKey.mockResolvedValue({ configured: true });
  mock.clearSessionKey.mockResolvedValue({ configured: false });
  mock.choose.mockResolvedValue('fixture-source');
});
afterEach(cleanup);

async function setup() {
  render(<App />);
  fireEvent.change(screen.getByLabelText('转换方式'), { target: { value: 'openai' } });
  fireEvent.change(screen.getByLabelText('地址'), { target: { value: 'https://example.invalid/v1' } });
  fireEvent.change(screen.getByLabelText('模型名称'), { target: { value: 'offline-model' } });
  fireEvent.click(screen.getByText('选择目录'));
  await waitFor(() => expect(screen.getByText('fixture-source')).toBeTruthy());
}

test('submission immediately clears password field while IPC is pending, then clear disables conversion', async () => {
  let finish!: (value: { configured: boolean }) => void;
  mock.setSessionKey.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await setup();
  const input = screen.getByLabelText('API Key') as HTMLInputElement;
  expect(input.type).toBe('password');
  expect((screen.getByText('开始转换') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(input, { target: { value: 'fake-only' } });
  fireEvent.click(screen.getByText('提交会话密钥'));
  expect(input.value).toBe('');
  expect(mock.setSessionKey).toHaveBeenCalledWith({ endpoint: 'https://example.invalid/v1', apiKey: 'fake-only' });
  expect((screen.getByText('开始转换') as HTMLButtonElement).disabled).toBe(true);
  finish({ configured: true });
  await waitFor(() => expect((screen.getByText('开始转换') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('清除会话密钥'));
  await waitFor(() => expect((screen.getByText('开始转换') as HTMLButtonElement).disabled).toBe(true));
  expect(mock.clearSessionKey).toHaveBeenCalledTimes(1);
  expect(mock.run).not.toHaveBeenCalled();
});

test('failed submission clears input and shows only the safe IPC error', async () => {
  mock.setSessionKey.mockRejectedValueOnce(new Error('非法密钥配置'));
  await setup();
  const input = screen.getByLabelText('API Key') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'fake-failure-secret' } });
  fireEvent.click(screen.getByText('提交会话密钥'));
  await screen.findByText('Error: 非法密钥配置');
  expect(input.value).toBe('');
  expect(document.body.textContent).not.toContain('fake-failure-secret');
});

test('a delayed status from the old endpoint cannot enable the new endpoint', async () => {
  let finish!: (value: { configured: boolean }) => void;
  mock.sessionKeyStatus.mockImplementation((endpoint: string) => endpoint.endsWith('/v1')
    ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ configured: false }));
  await setup();
  fireEvent.change(screen.getByLabelText('地址'), { target: { value: 'https://example.invalid/v2' } });
  finish({ configured: true });
  await waitFor(() => expect(screen.getByTestId('key-state').textContent).toContain('未配置'));
  expect((screen.getByText('开始转换') as HTMLButtonElement).disabled).toBe(true);
});

test('switching providers preserves each non-secret draft and discards unsubmitted key input', async () => {
  await setup();
  fireEvent.change(screen.getByLabelText('模型名称'), { target: { value: 'api-model-id' } });
  fireEvent.change(screen.getByLabelText('超时毫秒'), { target: { value: '3000' } });
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'unsubmitted-fixture' } });
  fireEvent.change(screen.getByLabelText('转换方式'), { target: { value: 'ollama' } });
  expect((screen.getByLabelText('模型名称') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('地址') as HTMLInputElement).value).toBe('http://127.0.0.1:11434');
  fireEvent.change(screen.getByLabelText('模型名称'), { target: { value: 'local-fixture' } });
  fireEvent.change(screen.getByLabelText('地址'), { target: { value: 'http://127.0.0.1:11435' } });
  fireEvent.change(screen.getByLabelText('转换方式'), { target: { value: 'openai' } });
  expect((screen.getByLabelText('模型名称') as HTMLInputElement).value).toBe('api-model-id');
  expect((screen.getByLabelText('地址') as HTMLInputElement).value).toBe('https://example.invalid/v1');
  expect((screen.getByLabelText('超时毫秒') as HTMLInputElement).value).toBe('3000');
  expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('转换方式'), { target: { value: 'ollama' } });
  expect((screen.getByLabelText('模型名称') as HTMLInputElement).value).toBe('local-fixture');
  expect((screen.getByLabelText('地址') as HTMLInputElement).value).toBe('http://127.0.0.1:11435');
  expect(mock.setSessionKey).not.toHaveBeenCalled();
  expect(mock.clearSessionKey).not.toHaveBeenCalled();
});

test('editing the address clears only unsubmitted key input without mutating main-process credentials', async () => {
  await setup();
  const input = screen.getByLabelText('API Key') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'unsubmitted-old-service-key' } });
  fireEvent.change(screen.getByLabelText('地址'), { target: { value: 'https://other.invalid/v1' } });
  expect(input.value).toBe('');
  expect(mock.setSessionKey).not.toHaveBeenCalled();
  expect(mock.clearSessionKey).not.toHaveBeenCalled();
});

test('a status reply from before submission cannot disable the newly saved key', async () => {
  let finish!: (value: { configured: boolean }) => void;
  mock.sessionKeyStatus.mockImplementation((endpoint: string) => endpoint.endsWith('/v1')
    ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ configured: false }));
  await setup();
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'fake-only' } });
  fireEvent.click(screen.getByText('提交会话密钥'));
  await waitFor(() => expect(screen.getByTestId('key-state').textContent).toContain('已配置'));
  await act(async () => { finish({ configured: false }); });
  expect(screen.getByTestId('key-state').textContent).toContain('已配置');
  expect((screen.getByText('开始转换') as HTMLButtonElement).disabled).toBe(false);
});

test('a status reply from before clearing cannot re-enable the cleared key', async () => {
  let finish!: (value: { configured: boolean }) => void;
  mock.sessionKeyStatus.mockImplementation((endpoint: string) => endpoint.endsWith('/v1')
    ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ configured: false }));
  await setup();
  fireEvent.click(screen.getByText('清除会话密钥'));
  await waitFor(() => expect((screen.getByText('清除会话密钥') as HTMLButtonElement).disabled).toBe(false));
  await act(async () => { finish({ configured: true }); });
  expect(screen.getByTestId('key-state').textContent).toContain('未配置');
  expect((screen.getByText('开始转换') as HTMLButtonElement).disabled).toBe(true);
});

test('rejected key replacement refreshes the presence of the retained main-process key', async () => {
  mock.sessionKeyStatus.mockResolvedValue({ configured: true });
  mock.setSessionKey.mockRejectedValueOnce(new Error('非法密钥配置'));
  await setup();
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'invalid-replacement-fixture' } });
  fireEvent.click(screen.getByText('提交会话密钥'));
  await screen.findByText('Error: 非法密钥配置');
  expect(screen.getByTestId('key-state').textContent).toContain('已配置');
  expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('');
  expect((screen.getByText('开始转换') as HTMLButtonElement).disabled).toBe(false);
  expect(document.body.textContent).not.toContain('invalid-replacement-fixture');
});

test('a fresh page starts with default drafts and an empty password field', async () => {
  await setup();
  fireEvent.change(screen.getByLabelText('模型名称'), { target: { value: 'previous-page-model' } });
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'previous-page-input' } });
  cleanup();
  render(<App />);
  expect((screen.getByLabelText('转换方式') as HTMLSelectElement).value).toBe('mock');
  fireEvent.change(screen.getByLabelText('转换方式'), { target: { value: 'openai' } });
  expect((screen.getByLabelText('地址') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('模型名称') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('');
});

test('missing base URL disables key submission and explains what to complete', () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('转换方式'), { target: { value: 'openai' } });
  expect((screen.getByText('提交会话密钥') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByTestId('api-config-hint').textContent).toContain('base URL');
  expect(screen.getByTestId('api-config-hint').textContent).toContain('模型 ID');
});

test.each([
  ['模型名称', '', '模型 ID', 'offline-model'],
  ['模型名称', 'invalid model', '不能含空白', 'offline-model'],
  ['地址', 'http://external.invalid/v1', 'HTTPS', 'https://example.invalid/v1'],
  ['地址', 'https://example.invalid/v1/chat/completions', '不要包含 /chat/completions', 'https://example.invalid/v1'],
  ['地址', 'https://user:fake-only-secret@example.invalid/v1', '凭据', 'https://example.invalid/v1'],
  ['超时毫秒', '0', '整数', '120000'],
  ['超时毫秒', '1.5', '整数', '120000'],
  ['超时毫秒', '600001', '整数', '120000'],
  ['超时毫秒', '', '整数', '120000'],
])('invalid %s value %s blocks conversion until corrected', async (label, value, hint, corrected) => {
  mock.sessionKeyStatus.mockResolvedValue({ configured: true });
  await setup();
  await waitFor(() => expect((screen.getByText('开始转换') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  expect(screen.getByTestId('api-config-hint').textContent).toContain(hint);
  expect(screen.getByTestId('api-config-hint').textContent).not.toContain('fake-only-secret');
  expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true');
  expect((screen.getByText('开始转换') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('开始转换'));
  expect(mock.run).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(label), { target: { value: corrected } });
  await waitFor(() => expect((screen.getByText('开始转换') as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByTestId('api-config-hint').textContent).toContain('格式有效');
});
