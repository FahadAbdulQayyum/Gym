const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('gymApp', {
  platform: process.platform,
});
