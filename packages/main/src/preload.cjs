const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('workbench',Object.freeze({
 choose:kind=>ipcRenderer.invoke('project:choose',kind), run:config=>ipcRenderer.invoke('project:run',config),cancel:()=>ipcRenderer.invoke('project:cancel'),
 export:format=>ipcRenderer.invoke('project:export',format),
 status:callback=>{const fn=(_e,s)=>callback(s);ipcRenderer.on('project:status',fn);return ()=>ipcRenderer.removeListener('project:status',fn);}
}));