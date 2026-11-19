import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { importZip } from './archive.js';

it('cloud CLI converts and exports dir/zip through loopback without leaking credentials', async () => {
  await mkdir('.deepworks/tmp', { recursive: true });
  const root = await mkdtemp(resolve('.deepworks/tmp/cloud-cli-'));
  const input = resolve(root, 'input'); await mkdir(input);
  await writeFile(resolve(input, 'main.cpp'), 'int add(int a, int b) { return a + b; }');
  const code = 'func add(a: Int32, b: Int32): Int32 { return a + b }';
  let requests = 0;
  const server = createServer((req, res) => {
    requests++; let body = ''; req.on('data', b => { body += String(b); });
    req.on('end', () => {
      expect(req.url).toBe('/v1/chat/completions');
      expect(req.headers.authorization).toBe('Bearer fixture-secret');
      expect(JSON.parse(body).model).toBe('fixture-model');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ kind: 'conversion', outputs: [{ path: 'main.cj', code }], unsupported: [], selfCheck: { passed: true, issues: [] }, explanation: 'fixture', confidence: 1 }) } }] }));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('port');
  const endpoint = 'http://127.0.0.1:' + address.port + '/v1';
  const run = (script: string, args: string[]) => new Promise<{ status: number | null; stdout: string; stderr: string }>((ok, no) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'packages/cli/src/' + script + '.ts', input, ...args], { env: { ...process.env, XDTRAN_API_KEY: 'fixture-secret' } });
    let stdout = '', stderr = ''; const timer = setTimeout(() => { child.kill(); no(Error('CLI timeout')); }, 20000);
    child.stdout.on('data', b => { stdout += String(b); }); child.stderr.on('data', b => { stderr += String(b); });
    child.on('error', e => { clearTimeout(timer); no(e); }); child.on('close', status => { clearTimeout(timer); ok({ status, stdout, stderr }); });
  });
  const args = ['--provider=openai', '--endpoint=' + endpoint, '--model=fixture-model', '--json'];
  try {
    const converted = await run('convert', args);
    expect(converted.status, converted.stderr).toBe(0);
    expect(JSON.parse(converted.stdout).providerId).toBe('openai');
    for (const format of ['dir', 'zip']) {
      const out = resolve(root, 'result-' + format);
      const result = await run('export', [...args, '--format=' + format, '--out=' + out]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout + result.stderr).not.toContain('fixture-secret');
      const dir = format === 'zip' ? await importZip(out) : out;
      const manifest = JSON.parse(await readFile(resolve(dir, 'export-manifest.json'), 'utf8'));
      expect(manifest.providerId).toBe('openai');
      expect(manifest.model).toBe('fixture-model');
      expect(JSON.stringify(manifest)).not.toContain('fixture-secret');
      expect(await readFile(resolve(dir, 'src/main.cj'), 'utf8')).toContain(code);
      const before = requests;
      expect((await run('export', [...args, '--format=' + format, '--out=' + out])).status).toBe(1);
      expect(requests).toBe(before);
    }
    const before = requests;
    expect((await run('export', ['--provider=openai', '--endpoint=https://example.invalid/v1', '--model=m', '--format=dir', '--out=' + resolve(root, 'denied')])).status).toBe(1);
    expect(requests).toBe(before);
    expect(requests).toBe(3);
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
}, 60000);
