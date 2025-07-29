const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { installClient } = require("./installer");
const { launchMinecraft, checkGameStatus } = require("./launcher");
const fetch = require("node-fetch");

let mainWindow;
let currentUsername = null;

const configPath = path.join(
  os.homedir(),
  "AppData",
  "Roaming",
  ".shampuneum",
  "config.json"
);

function ensureConfigDirectoryExists() {
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    resizable: true,
    minWidth: 1200,
    minHeight: 800,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, "preload.js"),
    },
    frame: true,
    titleBarStyle: "default",
  });

  checkGameStatus()
    .then((status) => {
      mainWindow.webContents.on("did-finish-load", () => {
        sendLogToRenderer("Лаунчер загружен успешно!");
        sendLogToRenderer(`Статус клиента: ${status.clientInstalled ? 'установлен' : 'не установлен'}`, 'info');
        if (status.details) {
          sendLogToRenderer(`Детали: Vanilla=${status.details.vanilla}, Fabric=${status.details.fabric}`, 'info');
        }
        mainWindow.webContents.send("installation-status", status);
      });
    })
    .catch((error) => {
      sendLogToRenderer(`Ошибка проверки статуса: ${error.message}`, "error");
    });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function sendLogToRenderer(message, type = "info") {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send("log-message", { message, type });
  }
}

// IPC handlers
ipcMain.handle("check-game-status", async () => {
  try {
    const status = await checkGameStatus();
    return status;
  } catch (error) {
    return {
      clientInstalled: false,
      versionsAvailable: false,
      clientPath: mcRoot,
      error: error.message
    };
  }
});

ipcMain.handle("auth-request", async (_, { username, password }) => {
  try {
    const response = await fetch("http://95.79.192.194:3000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (data.success) {
      currentUsername = username;
      return {
        success: true,
        username,
        access: "навсегда",
      };
    }
    return data;
  } catch (error) {
    return {
      success: false,
      message: "Ошибка соединения с сервером авторизации",
    };
  }
});

ipcMain.handle("get-current-user", () => {
  return currentUsername ? { username: currentUsername } : null;
});

ipcMain.handle("install-client", async (event, options = {}) => {
  try {
    if (!currentUsername) {
      throw new Error("Пользователь не авторизован");
    }

    sendLogToRenderer(`Начинается установка клиента для ${currentUsername}...`, "info");

    const installOptions = {
      ...options,
      fov: options.fov || "90.0",
      renderDistance: options.renderDistance || "12",
      maxFps: options.maxFps || "120",
      language: options.language || "ru_ru",
      autoConnectServer: options.autoConnectServer || false,
      modpack: options.modpack || "ULTRA", // Default to ULTRA
    };

    const result = await installClient(currentUsername, installOptions, sendLogToRenderer);
    sendLogToRenderer("Установка клиента завершена успешно!", "success");
    
    // Update status after installation
    const newStatus = await checkGameStatus();
    mainWindow.webContents.send("installation-status", newStatus);
    
    return result;
  } catch (error) {
    sendLogToRenderer(`Ошибка установки: ${error.message}`, "error");
    throw error;
  }
});

ipcMain.handle("launch-minecraft", async (event, options = {}) => {
  try {
    if (!currentUsername) {
      throw new Error("Пользователь не авторизован");
    }

    sendLogToRenderer(`Запуск Minecraft для ${currentUsername}...`, "info");
    const result = await launchMinecraft(currentUsername, options);
    sendLogToRenderer("Minecraft запущен успешно!", "success");
    return result;
  } catch (error) {
    sendLogToRenderer(`Ошибка запуска: ${error.message}`, "error");
    throw error;
  }
});

ipcMain.handle("app-quit", () => app.quit());

ipcMain.handle("show-error-dialog", async (_, title, content) => {
  return dialog.showMessageBox(mainWindow, {
    type: "error",
    title,
    message: content,
    buttons: ["OK"],
  });
});

ipcMain.handle("show-info-dialog", async (_, title, content) => {
  return dialog.showMessageBox(mainWindow, {
    type: "info",
    title,
    message: content,
    buttons: ["OK"],
  });
});

ipcMain.handle("get-app-version", () => app.getVersion());

ipcMain.handle("select-java-path", async () => {
  return dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Java Executable", extensions: ["exe", "bin"] }],
  });
});

ipcMain.handle("save-settings", (_, settings) => {
  try {
    ensureConfigDirectoryExists();
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to save settings: ${error.message}`);
  }
});

ipcMain.handle("load-settings", () => {
  try {
    ensureConfigDirectoryExists();
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath));
    }
    return { maxMemory: "4G", minMemory: "2G", javaPath: "(Автоматически)", modpack: "ULTRA" };
  } catch (error) {
    return { maxMemory: "4G", minMemory: "2G", javaPath: "(Автоматически)", modpack: "ULTRA" };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  sendLogToRenderer(`Критическая ошибка: ${error.message}`, "error");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  sendLogToRenderer(`Необработанная ошибка: ${reason}`, "error");
});