import { exportArchive } from '../../engine/src/archive.js';

const args=process.argv.slice(2), options=args.slice(1), controller=new AbortController();
process.once('SIGINT',()=>controller.abort());
const out=options.find(o=>o.startsWith('--out='))?.slice(6), budget=options.find(o=>o.startsWith('--budget-tokens='))?.split('=')[1];
if(!args[0] || !out || !options.includes('--provider=mock') || !options.some(o=>o==='--format=dir'||o==='--format=zip') || options.some(o=>!['--provider=mock','--format=dir','--format=zip','--json'].includes(o)&&!o.startsWith('--out=')&&!/^--budget-tokens=\d+$/.test(o)) || new Set(options.map(o=>o.split('=')[0])).size!==options.length) {
  console.error('用法：pnpm export <目录或ZIP> --provider=mock --format=dir|zip --out=<不存在的目录> [--budget-tokens=4096] [--json]'); process.exitCode=1;
} else {
  try {
    const m=await exportArchive(args[0],out,options.includes('--format=zip')?'zip':'dir',budget?Number(budget):4096,controller.signal);
    console.log(options.includes('--json')?JSON.stringify(m,null,2):`离线模拟导出：${m.status}\n文件：${m.exportedFileCount}\n目标：${out}\n非真实转换，未验证编译。`); process.exitCode=m.status==='complete'?0:2;
  } catch(e) {console.error(controller.signal.aborted?'CANCELLED: 导出已取消；检查目标目录是否有未完成残留。':String(e));process.exitCode=controller.signal.aborted?130:1;}
}