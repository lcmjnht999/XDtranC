import { chunkProject } from '@xdtranc/engine/chunker';
import { ProjectError } from '../../shared/src/errors.js';
const args = process.argv.slice(2), controller = new AbortController();
process.once('SIGINT', () => controller.abort());
const options = args.slice(1), budgetArg = options.find(a => a.startsWith('--budget-tokens='));
if (!args[0] || options.some(a => a !== '--json' && !/^--budget-tokens=\d+$/.test(a)) || new Set(options.map(a => a.split('=')[0])).size !== options.length) {
  console.error('用法：pnpm chunk <目录> [--budget-tokens=4096] [--json]'); process.exitCode = 1;
} else {
  try {
    const result = await chunkProject(args[0], budgetArg ? Number(budgetArg.split('=')[1]) : 4096, controller.signal);
    console.log(options.includes('--json') ? JSON.stringify(result, null, 2) : `状态：${result.status}\n预算：${result.budgetTokens}（UTF-8 字节保守估算，非模型 tokenizer）\n块数：${result.chunks.length}，未分配：${result.unassigned.length}，解析提示：${result.unsupported.length}\n${result.chunks.map(c => `${c.id}: ${c.files.join(', ')} | 估算 ${c.estTokens} | 依赖 ${c.deps.join(', ')}`).join('\n')}\n${[...result.unassigned, ...result.unsupported].map(i => `${i.sourcePath}:${i.line ?? '-'} ${i.reason}`).join('\n')}`);
    process.exitCode = result.status === 'partial' ? 2 : 0;
  } catch (e) { console.error(e instanceof ProjectError ? `${e.code}: ${e.message}` : controller.signal.aborted ? 'CANCELLED: 切分已取消' : String(e)); process.exitCode = controller.signal.aborted ? 130 : 1; }
}