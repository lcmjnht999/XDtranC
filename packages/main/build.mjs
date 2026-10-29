import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('packages/main/dist',{recursive:true});
await build({entryPoints:['packages/main/src/main.ts'],outfile:'packages/main/dist/main.mjs',bundle:true,platform:'node',format:'esm',external:['electron','web-tree-sitter','tree-sitter-wasms'],banner:{js:"import { createRequire as _cr } from 'node:module'; const require = _cr(import.meta.url);"}});
await copyFile('packages/main/src/preload.cjs','packages/main/dist/preload.cjs');
await copyFile('packages/renderer/index.html','packages/main/dist/index.html');