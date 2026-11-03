import { createServer } from 'node:http';
import { _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

await mkdir('.deepworks/tmp',{recursive:true});
const temp=await mkdtemp(resolve('.deepworks/tmp/desktop-test-'));
const statusText=()=>document.querySelector('[role=status]')?.textContent??'';
const errorText=()=>document.querySelector('pre.error')?.textContent??'';
const app=await electron.launch({args:['packages/main/dist/main.mjs'],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined},timeout:30000});
try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  await page.getByRole('heading',{name:'XDtranC 工作台'}).waitFor();
  const security=await app.evaluate(({BrowserWindow})=>{const p=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration};});
  assert.deepEqual(security,{sandbox:true,contextIsolation:true,nodeIntegration:false});
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});

  // 目录导入 → 转换 → 目录导出
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('samples/hello'));
  await page.getByRole('button',{name:'选择目录'}).click();
  await page.getByRole('button',{name:'开始转换'}).click();
  await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent?.includes('模拟完成'));
  await page.getByTestId('file-tree').waitFor();
  assert.match(await page.getByTestId('file-tree').innerText(),/main\.cpp/);
  assert.match(await page.getByTestId('summary').innerText(),/文件 2\/2/);
  assert.match(await page.getByText('本次结果：Mock 模拟').innerText(),/未验证编译/);

  await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},join(temp,'dir-target'));
  await page.getByRole('button',{name:'导出目录'}).click();
  await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent?.includes('导出结束：complete'));
  const manifest=JSON.parse(await readFile(join(temp,'dir-target','draft','export-manifest.json'),'utf8'));
  assert.equal(manifest.exportedFileCount,2);assert.equal(manifest.layout,'flat');
  assert.match(await readFile(join(temp,'dir-target','draft','src','calculator.cj'),'utf8'),/Calculator/);

  // 重复导出同目标必须拒绝
  await page.getByRole('button',{name:'导出目录'}).click();
  await page.waitForFunction(()=>document.querySelector('pre.error')?.textContent?.length);
  assert.match(await page.evaluate(errorText),/已存在/);

  // 非法 IPC 参数
  assert.equal(await page.evaluate(async()=>{try{await window.workbench.choose('bad');return false;}catch{return true;}}),true);

  // 转换中取消：状态必须先离开“进行中”再回落，不能只等按钮解禁。
  await page.evaluate(()=>{const run=[...document.querySelectorAll('button')].find(b=>b.textContent==='开始转换');const stop=[...document.querySelectorAll('button')].find(b=>b.textContent==='取消');run?.click();stop?.click();});
  await page.waitForFunction(()=>{const t=document.querySelector('[role=status]')?.textContent??'';return t==='已取消'||t.includes('模拟完成')||t==='失败';},{timeout:30000});
  await page.waitForFunction(()=>!([...document.querySelectorAll('button')].find(b=>b.textContent==='开始转换')?.disabled));
  assert.match(await page.evaluate(statusText),/取消|模拟完成/);

  // ZIP 导出
  await page.getByRole('button',{name:'开始转换'}).click();
  await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent?.includes('模拟完成'));
  await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},join(temp,'draft.zip'));
  await page.getByRole('button',{name:'导出 ZIP'}).click();
  await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent?.includes('导出结束：complete'));
  assert.equal((await readFile(join(temp,'draft.zip'))).readUInt32LE(0),0x04034b50);

  // 无效 ZIP 输入
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},join(temp,'missing.zip'));
  await page.getByRole('button',{name:'选择 ZIP'}).click();
  await page.getByRole('button',{name:'开始转换'}).click();
  await page.waitForFunction(()=>document.querySelector('pre.error')?.textContent?.length);
  assert.equal(await page.getByRole('button',{name:'导出目录'}).isDisabled(),true);

  // Ollama 503 不回退 Mock，且错误可见
  const server=createServer((req,res)=>{req.resume();req.on('end',()=>{res.writeHead(503);res.end('offline fixture');});});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  try{
    await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},resolve('samples/hello'));
    await page.getByRole('button',{name:'选择目录'}).click();
    await page.getByLabel('转换方式').selectOption('ollama');
    await page.getByLabel('已安装模型').fill('offline-test');
    await page.getByLabel('地址').fill('http://127.0.0.1:'+server.address().port);
    await page.getByRole('button',{name:'开始转换'}).click();
    await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent?.includes('部分完成'));
    const issues=await page.locator('pre.issues').innerText();
    assert.match(issues,/503|重试/);
    assert.equal(await page.getByText('本次结果：Mock 模拟').count(),0);
    assert.match(await page.getByText('Ollama / offline-test').innerText(),/未验证编译/);

    // 非回环地址直接拒绝
    await page.getByLabel('地址').fill('https://example.com');
    await page.getByRole('button',{name:'开始转换'}).click();
    await page.waitForFunction(()=>/回环|127|localhost/i.test(document.querySelector('pre.error')?.textContent??''));
  }finally{await new Promise(done=>{server.closeAllConnections();server.close(done);});}

  await page.screenshot({path:join(temp,'workbench.png')});
  console.log('桌面检查通过：隔离配置、真实按钮流程、文件树/摘要、目录与 ZIP 导出、覆盖拒绝、非法 IPC 参数、取消、无效 ZIP、Ollama 503 不回退、非回环拒绝。');
}finally{await app.close();}
