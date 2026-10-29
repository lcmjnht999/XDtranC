import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseProject } from '../../engine/src/index.js';
import { chunkModel } from '../../engine/src/chunker.js';
import { convertChunks, type ConversionReport } from '../../engine/src/converter.js';
import { desktopProvider } from './provider-config.js';
import { importZip, writeZip, scratchRoot, validateExportTarget } from '../../engine/src/archive.js';
import { exportReport } from '../../engine/src/exporter.js';
import { mkdtemp } from 'node:fs/promises';
import type { ProjectModel } from '../../shared/src/contracts.js';
const base=dirname(fileURLToPath(import.meta.url));let win:BrowserWindow;let selected='';let active:AbortController|undefined;let model:ProjectModel|undefined;let report:ConversionReport|undefined;
const status=(s:string)=>win.webContents.send('project:status',s);
function register(channel:string,handler:(arg:unknown)=>Promise<unknown>){ipcMain.handle(channel,async(event,arg)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('非法 IPC 来源');return handler(arg);});}
void app.whenReady().then(async()=>{
win=new BrowserWindow({width:1100,height:780,webPreferences:{preload:resolve(base,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
win.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
register('project:choose',async kind=>{if(active)throw new Error('任务执行中');if(kind!=='dir'&&kind!=='zip')throw new Error('非法输入类型');const result=await dialog.showOpenDialog(win,{properties:kind==='dir'?['openDirectory']:['openFile'],filters:kind==='zip'?[{name:'ZIP',extensions:['zip']}]:[]});if(result.canceled)return null;selected=result.filePaths[0];model=undefined;report=undefined;return selected;});
register('project:cancel',async()=>{active?.abort();return true;});
register('project:run',async(config)=>{
 if(active||!selected)throw new Error('请先选择输入且等待当前任务完成');active=new AbortController();model=undefined;report=undefined;const signal=active.signal;
 try{const provider=desktopProvider(config);status('解析中');const root=selected.toLowerCase().endsWith('.zip')?await importZip(selected,signal):selected;const m=await parseProject(root,signal);status('切分中');const plan=await chunkModel(m,4096,signal);status(provider.simulated?'Mock 转换中':'Ollama 转换中');const r=await convertChunks(m,plan,provider,signal);
 const previews=[];for(const f of m.files.slice(0,20)){signal.throwIfAborted();const p=resolve(m.root,f.path);if(await realpath(p)!==p)throw new Error('预览路径变化');const b=await readFile(p);if(createHash('sha256').update(b).digest('hex')!==f.hash)throw new Error('预览源码变化');previews.push({path:f.path,code:b.toString('utf8').slice(0,20000)});}
 model=m;report=r;status(r.status==='complete'?(r.simulated?'模拟完成':'模型草稿完成（未验证编译）'):'部分完成，请检查问题');return {previews,report:r};
 }catch(e){status(signal.aborted?'已取消':'失败');throw e;}finally{active=undefined;}
});
register('project:export',async format=>{
 if(format!=='dir'&&format!=='zip')throw new Error('非法导出格式');if(active||!model||!report)throw new Error('尚无可导出的结果');
 active=new AbortController();const signal=active.signal;
 try{const choice=await dialog.showSaveDialog(win,{title:'选择新的导出目标（不得已存在）',defaultPath:format==='zip'?'draft.zip':'draft'});if(choice.canceled||!choice.filePath)return null;signal.throwIfAborted();await validateExportTarget(selected,choice.filePath);await validateExportTarget(model.root,choice.filePath);status('导出中');
 let result;if(format==='dir')result=await exportReport(model,report,choice.filePath,signal);else{const stage=await mkdtemp(resolve(await scratchRoot(),'desktop-export-'));const draft=resolve(stage,'draft');result=await exportReport(model,report,draft,signal);await writeZip(draft,choice.filePath,signal);}status('导出结束：'+result.status);return {path:choice.filePath,status:result.status};
 }catch(e){status(signal.aborted?'已取消':'导出失败');throw e;}finally{active=undefined;}
});
await win.loadFile(resolve(base,'index.html'));win.on('closed',()=>{active?.abort();app.quit();});
});
