import { _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, cp, readFile, readdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(resolve('packages/engine/package.json'));const {ZipFile}=require('yazl');
await mkdir('.deepworks/tmp',{recursive:true});const temp=await mkdtemp(resolve('.deepworks/tmp/export-boundary-'));const source=join(temp,'source');await cp('samples/hello',source,{recursive:true});
async function snapshot(dir){const result={};for(const entry of await readdir(dir,{withFileTypes:true})){const p=join(dir,entry.name);result[entry.name]=entry.isDirectory()?await snapshot(p):(await readFile(p)).toString('base64');}return result;}
const before=await snapshot(source);const input=join(temp,'input.zip');const z=new ZipFile();z.addBuffer(await readFile(join(source,'main.cpp')),'main.cpp');z.addBuffer(await readFile(join(source,'include/math.hpp')),'include/math.hpp');const done=pipeline(z.outputStream,createWriteStream(input,{flags:'wx'}));z.end();await done;const zipBefore=await readFile(input);
const app=await electron.launch({args:['packages/main/dist/main.mjs'],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined},timeout:30000});
try{const page=await app.firstWindow();page.setDefaultTimeout(15000);
async function select(path,kind){await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},path);await page.click('#'+kind);await page.click('#run');await page.waitForFunction(()=>document.querySelector('#status').textContent==='模拟完成');}
async function target(path){await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});},path);}
await select(source,'dir');
for(const path of [join(source,'blocked.zip'),join(source,'include','blocked.zip')]){await target(path);await page.click('#exportZip');await page.waitForSelector('#error:not([hidden])');assert.match(await page.locator('#error').innerText(),/源码目录/);await assert.rejects(stat(path),{code:'ENOENT'});assert.deepEqual(await snapshot(source),before);}
await target(join(temp,'allowed.zip'));await page.click('#exportZip');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('导出结束：complete'));assert.equal((await readFile(join(temp,'allowed.zip'))).readUInt32LE(0),0x04034b50);
await select(input,'zip');await target(input);await page.click('#exportZip');await page.waitForSelector('#error:not([hidden])');assert.match(await page.locator('#error').innerText(),/已存在/);
await target(join(temp,'zip-output.zip'));await page.click('#exportZip');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('导出结束：complete'));assert.equal((await readFile(join(temp,'zip-output.zip'))).readUInt32LE(0),0x04034b50);assert.deepEqual(await readFile(input),zipBefore);assert.deepEqual(await snapshot(source),before);
console.log('通过：桌面源码内/子目录ZIP拒绝且输入树不变，外部ZIP成功，ZIP输入拒绝覆盖且外部导出成功。');
}finally{await app.close();}