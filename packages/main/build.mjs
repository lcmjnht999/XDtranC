import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await viteBuild({ configFile: resolve('packages/renderer/vite.config.ts'), logLevel: 'warn' });
await mkdir('packages/main/dist', { recursive: true });
await esbuild({ entryPoints: ['packages/main/src/main.ts'], outfile: 'packages/main/dist/main.mjs', bundle: true, platform: 'node', format: 'esm', external: ['electron', 'web-tree-sitter', 'tree-sitter-wasms'], banner: { js: "import { createRequire as _cr } from 'node:module'; const require = _cr(import.meta.url);" } });
await copyFile('packages/main/src/preload.cjs', 'packages/main/dist/preload.cjs');
