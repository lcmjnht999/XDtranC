import { lstat, realpath, mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, relative, sep, parse, isAbsolute } from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';
import { exportProject } from './exporter.js';
import { MockProvider } from './provider.js';
export const ZIP_LIMITS = { archiveBytes: 32*1024*1024, entries: 2000, fileBytes: 8*1024*1024, totalBytes: 64*1024*1024 };
export async function safeParents(path:string):Promise<void> {
 let current=parse(resolve(path)).root;
 for(const part of relative(current,resolve(path)).split(sep).filter(Boolean)) {current=resolve(current,part);const s=await lstat(current);if(s.isSymbolicLink()||!s.isDirectory())throw new Error('ZIP 目录边界包含链接或非目录');}
}
export async function scratchRoot():Promise<string> {
 const root=resolve('.deepworks/tmp');await safeParents(process.cwd());
 for(const p of [resolve('.deepworks'),root]) {try{await mkdir(p);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}await safeParents(p);}
 return root;
}
export function validateZipName(name:string):string {
 const clean=name.endsWith('/')?name.slice(0,-1):name;
 if(clean.length>240 || !clean || /[\\:<>"|?*\x00-\x1f]/.test(clean) || clean.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw new Error('ZIP 条目路径非法');
 return clean;
}
// ZIP CRC32 checked independently: yauzl verifies sizes but not checksums.
function crc32(bytes:Buffer):number {let c=0xffffffff;for(const b of bytes){c^=b;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export async function importZip(input:string, signal?:AbortSignal, limits=ZIP_LIMITS):Promise<string> {
 signal?.throwIfAborted();
 for(const n of Object.values(limits))if(!Number.isSafeInteger(n)||n<=0)throw new Error('ZIP 限额必须为正整数');
 const full=resolve(input); await safeParents(dirname(full));const stat=await lstat(full);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limits.archiveBytes)throw new Error('ZIP 输入类型或压缩包大小超限');
 const bytes=await readFile(full);if(bytes.length>limits.archiveBytes)throw new Error('ZIP 压缩包大小超限');
 const zip=await new Promise<yauzl.ZipFile>((ok,no)=>yauzl.fromBuffer(bytes,{lazyEntries:true,autoClose:false,strictFileNames:true,validateEntrySizes:true},(e,z)=>e?no(e):ok(z)));
 const files:{name:string;data:Buffer;directory:boolean}[]=[];const names=new Map<string,boolean>();let total=0,count=0;
 try {
  await new Promise<void>((ok,no)=>{
   const abort=()=>no(signal?.reason??new Error('取消'));signal?.addEventListener('abort',abort,{once:true});
   const fail=(e:unknown)=>{signal?.removeEventListener('abort',abort);no(e);};
   zip.on('error',fail);zip.on('end',()=>{signal?.removeEventListener('abort',abort);ok();});
   zip.on('entry',(entry:yauzl.Entry)=>{void (async()=>{
    signal?.throwIfAborted();if(++count>limits.entries)throw new Error('ZIP 条目数超限');
    const name=validateZipName(entry.fileName),directory=entry.fileName.endsWith('/'),key=name.normalize('NFC').toLowerCase();
    const mode=(entry.externalFileAttributes>>>16)&0xf000;
    if(mode!==0&&mode!==0x8000&&mode!==0x4000)throw new Error('ZIP 链接或特殊条目被拒绝');
    if((mode===0x4000&&!directory)||(mode===0x8000&&directory)||(entry.generalPurposeBitFlag&1))throw new Error('ZIP 类型矛盾或加密不支持');
    if(names.has(key)||[...names].some(([p,dir])=>(key.startsWith(p+'/')&&!dir)||(p.startsWith(key+'/')&&!directory)))throw new Error('ZIP 重复或文件目录冲突');
    names.set(key,directory);
    if(entry.uncompressedSize>limits.fileBytes || total+entry.uncompressedSize>limits.totalBytes)throw new Error('ZIP 解压大小超限');
    const stream=await new Promise<import('node:stream').Readable>((yes,not)=>zip.openReadStream(entry,(e,s)=>e?not(e):yes(s)));
    const parts:Buffer[]=[];let size=0;
    for await(const data of stream){signal?.throwIfAborted();const b=Buffer.from(data);size+=b.length;if(size>limits.fileBytes||total+size>limits.totalBytes){stream.destroy();throw new Error('ZIP 实际解压大小超限');}parts.push(b);}
    const data=Buffer.concat(parts);if(size!==entry.uncompressedSize||crc32(data)!==entry.crc32)throw new Error('ZIP 长度或 CRC 校验失败');
    if(directory&&size)throw new Error('ZIP 目录含数据');total+=size;files.push({name,data,directory});zip.readEntry();
   })().catch(fail);});zip.readEntry();
  });
 } finally {zip.close();}
 signal?.throwIfAborted();const target=await mkdtemp(resolve(await scratchRoot(),'zip-import-'));
 for(const file of files){signal?.throwIfAborted();const path=resolve(target,file.name);const r=relative(target,path);if(isAbsolute(r)||r==='..'||r.startsWith(`..${sep}`))throw new Error('ZIP 路径越界');await safeParents(target);await mkdir(file.directory?path:dirname(path),{recursive:true});await safeParents(file.directory?path:dirname(path));if(!file.directory)await writeFile(path,file.data,{flag:'wx'});}
 return target;
}
export async function writeZip(source:string,out:string,signal?:AbortSignal):Promise<void>{
 signal?.throwIfAborted();const root=resolve(source),target=resolve(out);await safeParents(root);await safeParents(dirname(target));
 const rel=relative(root,target);if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith(`..${sep}`))throw new Error('ZIP 输出不能位于输入目录内');
 try{await lstat(target);throw new Error('ZIP 目标已存在');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const zip=new yazl.ZipFile();let count=0,total=0;
 async function walk(dir:string):Promise<void>{for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){signal?.throwIfAborted();const full=resolve(dir,entry.name);if(entry.isSymbolicLink())throw new Error('ZIP 拒绝打包链接');if(entry.isDirectory())await walk(full);else if(entry.isFile()){if(++count>ZIP_LIMITS.entries)throw new Error('ZIP 条目数超限');const st=await lstat(full);if(st.size>ZIP_LIMITS.fileBytes||total+st.size>ZIP_LIMITS.totalBytes)throw new Error('ZIP 打包大小超限');if(await realpath(full)!==full)throw new Error('ZIP 文件路径变化');const data=await readFile(full);total+=data.length;if(data.length>ZIP_LIMITS.fileBytes||total>ZIP_LIMITS.totalBytes)throw new Error('ZIP 打包大小超限');zip.addBuffer(data,validateZipName(relative(root,full).split(sep).join('/')));}else throw new Error('ZIP 不支持特殊文件');}}
 await walk(root);signal?.throwIfAborted();await safeParents(dirname(target));const output=createWriteStream(target,{flags:'wx'});
 const done=pipeline(zip.outputStream,output,{signal});zip.end();await done;
}
export async function validateExportTarget(input:string,out:string):Promise<void> {
 const target=resolve(out);await safeParents(dirname(target));
 const original=await realpath(resolve(input));
 if((await lstat(original)).isDirectory()) {
  const r=relative(original,target);
  if(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep))throw new Error('导出目标不得位于源码目录内');
 }
 try{await lstat(target);throw new Error('目标已存在，拒绝覆盖');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
}
export async function exportArchive(input:string,out:string,format:'dir'|'zip',budget=4096,signal?:AbortSignal){
 await validateExportTarget(input,out);
 const source=input.toLowerCase().endsWith('.zip')?await importZip(input,signal):input;
 if(format==='dir')return exportProject(source,out,new MockProvider(),budget,signal);
 const stage=await mkdtemp(resolve(await scratchRoot(),'zip-export-'));const draft=resolve(stage,'draft');
 const manifest=await exportProject(source,draft,new MockProvider(),budget,signal);await writeZip(draft,out,signal);return manifest;
}