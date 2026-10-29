import { test, expect } from 'vitest';
import { mkdir, mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { validateExportTarget } from './archive.js';
test('统一目标校验拒绝源码内部和已有目标，允许相邻新目标',async()=>{
 await mkdir('.deepworks/tmp',{recursive:true});const base=await mkdtemp(resolve('.deepworks/tmp/target-test-'));const source=join(base,'source');await mkdir(join(source,'nested'),{recursive:true});
 for(const out of [source,join(source,'out.zip'),join(source,'nested','out.zip'),join(source,'nested','..','out.zip')])await expect(validateExportTarget(source,out)).rejects.toThrow('源码目录');
 if(process.platform==='win32')await expect(validateExportTarget(source,join(source.toUpperCase(),'out.zip'))).rejects.toThrow('源码目录');
 await expect(validateExportTarget(source,join(base,'source-output.zip'))).resolves.toBeUndefined();
 const zip=join(base,'input.zip');await writeFile(zip,'fixture');await expect(validateExportTarget(zip,zip)).rejects.toThrow('已存在');await expect(validateExportTarget(zip,join(base,'new.zip'))).resolves.toBeUndefined();expect(await readdir(source)).toEqual(['nested']);
});