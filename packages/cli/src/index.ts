import { parseProject } from '@xdtranc/engine';
import { ProjectError } from '../../shared/src/errors.js';
const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--json')) {
  console.error('用法：pnpm parse <目录> [--json]'); process.exitCode = 1;
} else {
  try {
    const model = await parseProject(args[0]);
    console.log(args[1] === '--json' ? JSON.stringify(model, null, 2) : `状态：${model.status}\n文件：${model.stats.files}，有效 UTF-8 行数：${model.stats.lines}\n声明：${model.symbols.length}，include：${model.deps.length}\n问题：${model.unsupported.length}\n${model.unsupported.map(i => `${i.sourcePath}:${i.line ?? '-'} ${i.reason}`).join('\n')}`);
    process.exitCode = model.status === 'partial' ? 2 : 0;
  } catch (error) { console.error(error instanceof ProjectError ? `${error.code}: ${error.message}` : String(error)); process.exitCode = 1; }
}