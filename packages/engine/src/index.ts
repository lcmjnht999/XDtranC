import { readdir, readFile, realpath, lstat } from 'node:fs/promises';
import { resolve, relative, extname, dirname, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import Parser from 'web-tree-sitter';
import type { ProjectModel } from '@xdtranc/shared';
import { ProjectError } from '../../shared/src/errors.js';
const require = createRequire(import.meta.url);
const ignored = new Set(['.git', '.xdtranc', 'node_modules', 'build', 'dist', '.deepworks']);
const extensions = new Set(['.h', '.hpp', '.cpp', '.cc', '.cxx']);
const portable = (p: string) => p.split(sep).join('/');
const inside = (root: string, p: string) => { const r = relative(root, p); return r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r); };
let language: Promise<Parser.Language> | undefined;
async function getLanguage() {
  language ??= (async () => { await Parser.init(); return Parser.Language.load(require.resolve('tree-sitter-wasms/out/tree-sitter-cpp.wasm')); })();
  return language;
}
export async function parseProject(input: string, signal?: AbortSignal): Promise<ProjectModel> {
  signal?.throwIfAborted(); const requested = resolve(input);
  let root: string;
  try { if (!(await lstat(requested)).isDirectory()) throw new Error(); root = await realpath(requested); }
  catch { throw new ProjectError('INVALID_DIRECTORY', '输入必须是存在的真实目录（不接受目录链接）'); }
  const model: ProjectModel = { root, files: [], symbols: [], deps: [], unsupported: [], stats: { files: 0, lines: 0 }, status: 'complete' };
  const issue = (sourcePath: string, line: number | null, reason: string) => model.unsupported.push({ sourcePath, line, reason });
  const paths: string[] = [];
  async function walk(dir: string): Promise<void> {
    signal?.throwIfAborted(); let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { issue(portable(relative(root, dir)), null, '目录无法读取'); return; }
    for (const entry of entries.sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const full = resolve(dir, entry.name), path = portable(relative(root, full));
      if (entry.isSymbolicLink()) { issue(path, null, '跳过符号链接或目录联接'); continue; }
      if (entry.isDirectory()) { if (!ignored.has(entry.name)) await walk(full); continue; }
      if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) paths.push(full);
    }
  }
  await walk(root);
  model.discoveredFiles = paths.map(p => portable(relative(root, p))); model.summaries = [];
  if (!paths.length) throw new ProjectError('NO_CPP_FILES', '目录中没有可读取的 C++ 文件');
  const cpp = await getLanguage(); const parser = new Parser(); parser.setLanguage(cpp);
  try {
    for (const full of paths) {
      signal?.throwIfAborted(); const path = portable(relative(root, full));
      try {
        const actual = await realpath(full);
        if (!inside(root, actual) || (await lstat(full)).isSymbolicLink()) { issue(path, null, '拒绝越界或链接文件'); continue; }
        const bytes = await readFile(actual);
        const file = { path, hash: createHash('sha256').update(bytes).digest('hex'), lines: null as number | null };
        model.files.push(file);
        let text: string;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch { issue(path, null, '非法 UTF-8 编码，未解析'); continue; }
        file.lines = text.length ? text.split(/\r\n|\n|\r/).length - (/\r?\n$|\r$/.test(text) ? 1 : 0) : 0;
        const tree = parser.parse(text);
        try {
          const visit = (node: Parser.SyntaxNode): void => {
            const line = node.startPosition.row + 1;
            let scope = node.parent;
            const scopes: string[] = [];
            while (scope) {
              if (scope.type === 'compound_statement') break;
              if (['class_specifier', 'struct_specifier', 'namespace_definition'].includes(scope.type)) scopes.unshift(scope.childForFieldName('name')?.text ?? '(匿名)');
              scope = scope.parent;
            }
            const scoped = (signature: string) => scopes.length ? `[scope ${scopes.join('::')}] ${signature}` : signature;
            if (node.type === 'ERROR' || node.isMissing()) { issue(path, line, 'C++ 语法错误或缺失节点'); return; }
            if (node.type === 'template_declaration' || node.type === 'preproc_function_def') issue(path, line, '模板或函数宏仅作语法识别，不保证语义解析');
            if (['class_specifier', 'struct_specifier', 'function_definition'].includes(node.type)) {
              const name = node.childForFieldName('name') ?? node.childForFieldName('declarator');
              model.symbols.push({ sourcePath: path, line, kind: node.type, name: name?.text ?? '(匿名)' });
            }
            if (node.type === 'function_declarator' && node.parent?.type !== 'function_definition') {
              model.symbols.push({ sourcePath: path, line, kind: 'function_declaration', name: node.text });
            }
            if (node.type === 'function_definition') {
              const body = node.childForFieldName('body');
              if (body) model.summaries!.push({ sourcePath: path, line, signature: scoped(text.slice(node.startIndex, body.startIndex).trim() + ';') });
            } else if ((node.type === 'declaration' && node.parent?.type !== 'compound_statement') || node.type === 'field_declaration') {
              if (!scope && !node.descendantsOfType(['function_definition', 'class_specifier', 'struct_specifier', 'lambda_expression']).length) model.summaries!.push({ sourcePath: path, line, signature: scoped(node.text) });
            } else if (node.type === 'class_specifier' || node.type === 'struct_specifier') {
              model.summaries!.push({ sourcePath: path, line, signature: `${node.type === 'class_specifier' ? 'class' : 'struct'} ${node.childForFieldName('name')?.text ?? '(匿名)'};` });
            }
            if (node.type === 'preproc_include') {
              const value = node.childForFieldName('path')?.text ?? '';
              const system = value.startsWith('<'), quoted = value.startsWith('"');
              const include = system || quoted ? value.slice(1, -1) : value;
              const target = resolve(dirname(full), include);
              const local = quoted && inside(root, target) && paths.includes(target);
              model.deps.push({ sourcePath: path, line, include, kind: system ? 'system' : local ? 'local' : 'unresolved', ...(local ? { targetPath: portable(relative(root, target)) } : {}) });
              if (!system && !local) issue(path, line, `未解析 include：${include}（本片仅按当前文件目录解析）`);
            }
            for (const child of node.namedChildren) visit(child);
          };
          visit(tree.rootNode);
        } finally { tree.delete(); }
      } catch (error) { issue(path, null, `文件处理失败：${error instanceof Error ? error.message : '未知错误'}`); }
    }
  } finally { parser.delete(); }
  model.stats = { files: paths.length, lines: model.files.reduce((n, f) => n + (f.lines ?? 0), 0) };
  model.status = model.unsupported.length ? 'partial' : 'complete';
  return model;
}