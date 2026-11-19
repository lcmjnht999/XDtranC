const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('workbench',Object.freeze({
 choose:kind=>ipcRenderer.invoke('project:choose',kind), run:config=>ipcRenderer.invoke('project:run',config),cancel:()=>ipcRenderer.invoke('project:cancel'),
 paste:payload=>ipcRenderer.invoke('project:paste',payload),
 setSessionKey:payload=>ipcRenderer.invoke('provider:key-set',payload),
 sessionKeyStatus:endpoint=>ipcRenderer.invoke('provider:key-status',endpoint),
 clearSessionKey:()=>ipcRenderer.invoke('provider:key-clear'),
 export:(format,options)=>ipcRenderer.invoke('project:export',{format,options}),
 status:callback=>{const fn=(_e,s)=>callback(s);ipcRenderer.on('project:status',fn);return ()=>ipcRenderer.removeListener('project:status',fn);}
}));
