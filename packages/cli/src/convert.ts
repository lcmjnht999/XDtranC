import { convertProject } from '../../engine/src/converter.js';
import { OllamaProvider } from '../../engine/src/ollama.js';
import { MockProvider } from '../../engine/src/provider.js';
const args = process.argv.slice(2), opts = args.slice(1), controller = new AbortController();
process.once('SIGINT',()=>controller.abort());
if (!args[0] || !opts.some(o => o === '--provider=mock' || o === '--provider=ollama') || opts.some(o=>o!=='--provider=mock' && o!=='--provider=ollama' && !o.startsWith('--model=') && !o.startsWith('--endpoint=') && !/^--timeout-ms=\d+$/.test(o) && o!=='--json' && !/^--budget-tokens=\d+$/.test(o)) || new Set(opts.map(o=>o.split('=')[0])).size!==opts.length) {
  console.error('用法：pnpm convert <目录> --provider=mock [--budget-tokens=4096] [--json][--model=<本机模型>] [--endpoint=http://127.0.0.1:11434] [--timeout-ms=120000]；provider 可选 mock/ollama'); process.exitCode=1;
} else {
  try {
    const budget=opts.find(o=>o.startsWith('--budget-tokens='));
    const option=(key:string)=>opts.find(o=>o.startsWith(key+'='))?.slice(key.length+1);
    if(opts.includes('--provider=mock') && opts.some(o=>/^--(model|endpoint|timeout-ms)=/.test(o))) throw new Error('Mock 不接受模型连接参数');
    const provider=opts.includes('--provider=ollama') ? new OllamaProvider(option('--model')??'',option('--endpoint'),Number(option('--timeout-ms')??120000)) : new MockProvider();
    const result=await convertProject(args[0],provider,budget?Number(budget.split('=')[1]):4096,controller.signal);
    console.log(opts.includes('--json')?JSON.stringify(result,null,2):`${result.simulated ? "离线模拟，不是真实转换" : "本机 Ollama 草稿，未验证编译"}\n状态：${result.status}\n已处理块：${result.results.length}，失败块：${result.failedChunks.length}，未分配：${result.unassigned.length}\n${result.unsupported.map(i=>`${i.sourcePath}: ${i.reason}`).join('\n')}`);
    process.exitCode=result.status==='complete'?0:2;
  } catch(e) { console.error(controller.signal.aborted?'CANCELLED: 转换已取消':String(e)); process.exitCode=controller.signal.aborted?130:1; }
}