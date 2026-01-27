/**
 * Electron Main Process
 * Handles window management, file system operations, and IPC
 * Using CommonJS for maximum Electron compatibility
 */

const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs/promises");

let mainWindow;
const isDev = process.argv.includes("--dev");

/**
 * Register IPC handlers (called after app is ready)
 */
function registerIPCHandlers() {
  // ============================================================================
  // IPC HANDLERS - File System Operations
  // ============================================================================

  /**
   * Read file from disk
   */
  ipcMain.handle("fs:readFile", async (event, filePath) => {
    try {
      const buffer = await fs.readFile(filePath);
      return buffer;
    } catch (err) {
      console.error("Failed to read file:", err);
      throw err;
    }
  });

  /**
   * Write file to disk
   */
  ipcMain.handle("fs:writeFile", async (event, filePath, content) => {
    try {
      await fs.writeFile(filePath, content);
      return true;
    } catch (err) {
      console.error("Failed to write file:", err);
      throw err;
    }
  });

  /**
   * Append to file on disk
   */
  ipcMain.handle("fs:appendFile", async (event, filePath, content) => {
    try {
      await fs.appendFile(filePath, content);
      return true;
    } catch (err) {
      console.error("Failed to append to file:", err);
      throw err;
    }
  });

  /**
   * Read directory contents
   */
  ipcMain.handle("fs:readdir", async (event, dirPath) => {
    try {
      const files = await fs.readdir(dirPath);
      return files;
    } catch (err) {
      console.error("Failed to read directory:", err);
      throw err;
    }
  });

  /**
   * Create directory (recursively)
   */
  ipcMain.handle("fs:ensureDir", async (event, dirPath) => {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return true;
    } catch (err) {
      console.error("Failed to create directory:", err);
      throw err;
    }
  });

  /**
   * Move file to another location
   */
  ipcMain.handle("fs:moveFile", async (event, sourcePath, destPath) => {
    try {
      await fs.rename(sourcePath, destPath);
      return true;
    } catch (err) {
      console.error("Failed to move file:", err);
      throw err;
    }
  });

  /**
   * Check if path exists
   */
  ipcMain.handle("fs:exists", async (event, dirPath) => {
    try {
      await fs.access(dirPath);
      return true;
    } catch {
      return false;
    }
  });

  /**
   * Delete file or directory
   */
  ipcMain.handle("fs:delete", async (event, filePath) => {
    try {
      await fs.rm(filePath, { recursive: true, force: true });
      return true;
    } catch (err) {
      console.error("Failed to delete:", err);
      throw err;
    }
  });

  // ============================================================================
  // IPC HANDLERS - Dialog Operations
  // ============================================================================

  /**
   * Show open dialog for directory selection
   */
  ipcMain.handle("dialog:selectDirectory", async (event) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
        title: "Select Primary Directory for Batch Processing",
        message: "Choose a directory containing PDF files",
      });

      if (result.canceled) {
        return null;
      }

      return result.filePaths[0];
    } catch (err) {
      console.error("Failed to select directory:", err);
      throw err;
    }
  });

  /**
   * Show save dialog
   */
  ipcMain.handle("dialog:saveFile", async (event, defaultPath) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath,
        filters: [{ name: "All Files", extensions: ["*"] }],
      });

      if (result.canceled) {
        return null;
      }

      return result.filePath;
    } catch (err) {
      console.error("Failed to save file:", err);
      throw err;
    }
  });

  /**
   * Show message dialog
   */
  ipcMain.handle("dialog:showMessage", async (event, options) => {
    return dialog.showMessageBox(mainWindow, options);
  });
}

/**
 * Create the main window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "electron-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true,
    },
  });

  const startUrl = isDev
    ? "http://localhost:5173"
    : `file://${path.join(__dirname, "../renderer/index.html")}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  createApplicationMenu();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Create application menu
 */
function createApplicationMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Exit",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "Redo", accelerator: "CmdOrCtrl+Y", role: "redo" },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", role: "paste" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ============================================================================
// App Event Handlers
// ============================================================================

app.on("ready", () => {
  registerIPCHandlers();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle any uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

module.exports = { app, mainWindow };
