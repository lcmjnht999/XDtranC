import { exportArchive } from '../../engine/src/archive.js';

const args = process.argv.slice(2);
const options = args.slice(1);
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
const out = options.find(o => o.startsWith('--out='))?.slice('--out='.length);
const budget = options.find(o => o.startsWith('--budget-tokens='))?.split('=')[1];
const packageName = options.find(o => o.startsWith('--package='))?.slice('--package='.length);
const cjpm = options.includes('--cjpm');
const usage = '用法：pnpm export <目录或ZIP> --provider=mock --format=dir|zip --out=<不存在的目标> [--budget-tokens=4096] [--cjpm [--package=<name>]] [--json]';
const allowed = options.every(o =>
  ['--provider=mock', '--format=dir', '--format=zip', '--json', '--cjpm'].includes(o) ||
  o.startsWith('--out=') || /^--budget-tokens=\d+$/.test(o) || /^--package=.+$/.test(o));
const valid = Boolean(args[0]) && Boolean(out) && options.includes('--provider=mock') &&
  options.some(o => o === '--format=dir' || o === '--format=zip') && allowed &&
  new Set(options.map(o => o.split('=')[0])).size === options.length &&
  (packageName === undefined || cjpm);
if (!valid) {
  console.error(usage);
  process.exitCode = 1;
} else {
  try {
    const m = await exportArchive(args[0] as string, out as string, options.includes('--format=zip') ? 'zip' : 'dir', budget ? Number(budget) : 4096, controller.signal, { cjpm, packageName });
    console.log(options.includes('--json') ? JSON.stringify(m, null, 2) : `导出（模拟）：${m.status}\n布局：${m.layout}\n文件：${m.exportedFileCount}\n目标：${out}\n产物是未验证编译的草稿。`);
    process.exitCode = m.status === 'complete' ? 0 : 2;
  } catch (e) {
    console.error(controller.signal.aborted ? 'CANCELLED: 用户取消；检查目标目录是否留下未完成标记' : String(e));
    process.exitCode = controller.signal.aborted ? 130 : 1;
  }
}
