import { it, expect } from 'vitest';
import { createServer, type RequestListener } from 'node:http';
import { OllamaProvider } from './ollama.js';
import { convertProject } from './converter.js';
const request={prompt:'转换',sources:[{path:'a.cpp',code:'int a;'}],contextBundle:[],retryIssues:['修正结构']};
async function server(handler:RequestListener, test:(url:string)=>Promise<void>) {
 const s=createServer(handler); await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const a=s.address();if(!a||typeof a==='string')throw new Error('no address');
 try {await test(`http://127.0.0.1:${a.port}`);} finally {s.closeAllConnections();await new Promise<void>((r,j)=>s.close(e=>e?j(e):r()));}
}
it('只接受明确回环 IP、模型和有限超时',()=>{
 for(const url of ['https://127.0.0.1','http://localhost','http://example.com','http://127.0.0.1/path','http://u:p@127.0.0.1','http://127.0.0.1?q=x'])expect(()=>new OllamaProvider('m',url)).toThrow();
 expect(()=>new OllamaProvider('')).toThrow();expect(()=>new OllamaProvider('m',undefined,0)).toThrow();expect(()=>new OllamaProvider('m',undefined,600001)).toThrow();
});
it('真实 HTTP 协议、UTF-8 和最小载荷',async()=>{
 await server((req,res)=>{let body='';req.setEncoding('utf8');req.on('data',d=>body+=d);req.on('end',()=>{const b=JSON.parse(body);expect(req.url).toBe('/api/chat');expect(b.model).toBe('local');expect(b.stream).toBe(false);expect(JSON.parse(b.messages[1].content)).toEqual({sources:request.sources,contextBundle:[],retryIssues:request.retryIssues});res.end(JSON.stringify({done:true,message:{content:'{"中文":"草稿"}'}}));});},async url=>{const p=new OllamaProvider('local',url);expect(p.simulated).toBe(false);expect(await p.generate(request)).toBe('{"中文":"草稿"}');});
});
it('HTTP 错误、重定向和异常内容不泄漏响应正文',async()=>{
 for(const mode of ['http','redirect','json','missing','large'])await server((_req,res)=>{if(mode==='http'){res.statusCode=404;res.end('secret-body');}else if(mode==='redirect'){res.writeHead(302,{location:'http://example.com'});res.end();}else if(mode==='json')res.end('secret-body');else if(mode==='large')res.end('x'.repeat(4*1024*1024+1));else res.end('{}');},async url=>{await expect(new OllamaProvider('m',url).generate(request)).rejects.toThrow(/Ollama/);});
});
it('超时和调用中取消',async()=>{
 await server(()=>{},async url=>{
 await expect(new OllamaProvider('m',url,30).generate(request)).rejects.toThrow('超时');const c=new AbortController();const timer=setTimeout(()=>c.abort(),30);try{await expect(new OllamaProvider('m',url).generate(request,c.signal)).rejects.toMatchObject({name:'AbortError'});}finally{clearTimeout(timer);}
 const d=new AbortController();d.abort();await expect(new OllamaProvider('m',url).generate(request,d.signal)).rejects.toMatchObject({name:'AbortError'});
 });
});
it('协议适配复用 schema 重试流程（不是实际模型）',async()=>{
 let calls=0;
 await server((req,res)=>{req.resume();req.on('end',()=>{calls++;res.end(JSON.stringify({done:true,message:{content:calls===1?'{}':JSON.stringify({kind:'conversion',outputs:[{path:`out${calls}.cj`,code:'main() { return 0 }'}],unsupported:[],selfCheck:{passed:true,issues:[]},explanation:'测试服务器',confidence:0})}}));});},async url=>{
 const r=await convertProject('samples/hello',new OllamaProvider('test-server',url));expect(r.status).toBe('complete');expect(r.results[0].attempts).toBe(2);expect(calls).toBe(3);
 });
});