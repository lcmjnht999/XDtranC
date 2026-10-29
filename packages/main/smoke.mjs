import { createServer } from 'node:http';
import { _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
await mkdir('.deepworks/tmp',{recursive:true});const temp=await mkdtemp(resolve('.deepworks/tmp/desktop-test-'));
const app=await electron.launch({args:['packages/main/dist/main.mjs'],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined},timeout:30000});
try{
const page=await app.firstWindow();await page.waitForSelector('#dir');
const security=await app.evaluate(({BrowserWindow})=>{const p=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration};});assert.deepEqual(security,{sandbox:true,contextIsolation:true,nodeIntegration:false});assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('samples/hello'));
await page.click('#dir');await page.click('#run');await page.waitForFunction(()=>document.querySelector('#status').textContent==='模拟完成');assert.match(await page.locator('#output').innerText(),/Calculator/);assert.match(await page.locator('#input').innerText(),/int main/);
await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},join(temp,'draft'));
await page.click('#exportDir');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('导出结束：complete'));
assert.equal(JSON.parse(await readFile(join(temp,'draft/export-manifest.json'),'utf8')).exportedFileCount,2);
await page.click('#exportDir');await page.waitForSelector('#error:not([hidden])');assert.match(await page.locator('#error').innerText(),/已存在/);
const invalid=await page.evaluate(async()=>{try{await window.workbench.choose('bad');return false;}catch{return true;}});assert.equal(invalid,true);
await page.evaluate(()=>{document.querySelector('#run').click();document.querySelector('#cancel').click();});await page.waitForFunction(()=>!document.querySelector('#run').disabled);assert.match(await page.locator('#status').innerText(),/取消|模拟完成/);
await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},join(temp,'draft.zip'));
await page.click('#run');await page.waitForFunction(()=>document.querySelector('#status').textContent==='模拟完成');await page.click('#exportZip');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('导出结束：complete'));assert.equal((await readFile(join(temp,'draft.zip'))).readUInt32LE(0),0x04034b50);
await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},join(temp,'missing.zip'));
await page.click('#zip');await page.click('#run');await page.waitForSelector('#error:not([hidden])');assert.equal(await page.locator('#exportDir').isDisabled(),true);
const server=createServer((req,res)=>{req.resume();req.on('end',()=>{res.writeHead(503);res.end('offline fixture');});});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('samples/hello'));
await page.click('#dir');await page.selectOption('#provider','ollama');await page.fill('#model','offline-test');await page.fill('#endpoint','http://127.0.0.1:'+server.address().port);
await page.click('#run');await page.waitForFunction(()=>!document.querySelector('#run').disabled);
assert.match(await page.locator('#resultMode').innerText(),/Ollama/);assert.match(await page.locator('#issues').innerText(),/503/);assert.equal(await page.locator('#output').innerText(),'');
await page.fill('#endpoint','https://example.com');await page.click('#run');await page.waitForSelector('#error:not([hidden])');assert.equal(await page.locator('#exportDir').isDisabled(),true);
console.log('桌面 Ollama：回环模拟服务503进入失败清单，无Mock回退；非回环地址拒绝。未调用真实模型。');
}finally{await new Promise(resolve=>server.close(resolve));}
await page.screenshot({path:join(temp,'workbench.png')});console.log('桌面检查通过：隔离配置、真实按钮流程、预览、目录导出、覆盖拒绝、非法 IPC 参数；ZIP 导出及无效输入失败状态已验证');
}finally{await app.close();}