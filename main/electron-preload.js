/**
 * Electron Preload Script
 * Exposes safe APIs to the renderer process via contextBridge
 * Using CommonJS because preload runs in a special context
 */

const { contextBridge, ipcRenderer } = require("electron");

// File system API
const fsAPI = {
  readFile: (filePath) => ipcRenderer.invoke("fs:readFile", filePath),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke("fs:writeFile", filePath, content),
  appendFile: (filePath, content) =>
    ipcRenderer.invoke("fs:appendFile", filePath, content),
  readdir: (dirPath) => ipcRenderer.invoke("fs:readdir", dirPath),
  ensureDir: (dirPath) => ipcRenderer.invoke("fs:ensureDir", dirPath),
  moveFile: (sourcePath, destPath) =>
    ipcRenderer.invoke("fs:moveFile", sourcePath, destPath),
  exists: (dirPath) => ipcRenderer.invoke("fs:exists", dirPath),
  delete: (filePath) => ipcRenderer.invoke("fs:delete", filePath),
};

// Dialog API
const dialogAPI = {
  selectDirectory: () => ipcRenderer.invoke("dialog:selectDirectory"),
  saveFile: (defaultPath) =>
    ipcRenderer.invoke("dialog:saveFile", defaultPath),
  showMessage: (options) => ipcRenderer.invoke("dialog:showMessage", options),
};

// Expose APIs to renderer
contextBridge.exposeInMainWorld("electronAPI", {
  fs: fsAPI,
  dialog: dialogAPI,
});
