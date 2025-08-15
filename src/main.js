const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { installClient } = require("./installer");
const { launchMinecraft, checkGameStatus } = require("./launcher");
const fetch = require("node-fetch");
const LauncherUpdater = require("./updater");
const crypto = require("crypto");

let updater;
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
function getEncryptionKey() {
  const machineId = os.hostname() + os.platform() + os.arch();
  return crypto
    .createHash("sha256")
    .update(machineId + "shampuneum_launcher")
    .digest();
}

function encryptPassword(password) {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

    let encrypted = cipher.update(password, "utf8", "hex");
    encrypted += cipher.final("hex");

    return iv.toString("hex") + ":" + encrypted;
  } catch (error) {
    console.error("Encryption error:", error);
    return null;
  }
}

function decryptPassword(encryptedPassword) {
  try {
    const key = getEncryptionKey();
    const parts = encryptedPassword.split(":");
    if (parts.length !== 2) {
      throw new Error("Invalid encrypted password format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    return null;
  }
}
function saveAccountData(username, password, rememberMe = false) {
  try {
    ensureConfigDirectoryExists();

    const config = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, "utf8"))
      : {};

    if (rememberMe) {
      const encryptedPassword = encryptPassword(password);

      if (encryptedPassword) {
        config.savedAccount = {
          username: username,
          encryptedPassword: encryptedPassword,
          rememberMe: true,
          savedAt: Date.now(),
        };

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
      }
    } else {
      delete config.savedAccount;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }

    return false;
  } catch (error) {
    console.error("Error saving account data:", error);
    return false;
  }
}
function loadSavedAccount() {
  try {
    if (!fs.existsSync(configPath)) return null;

    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!config.savedAccount || !config.savedAccount.rememberMe) return null;

    const daysPassed =
      (Date.now() - config.savedAccount.savedAt) / (1000 * 60 * 60 * 24);
    if (daysPassed > 30) {
      console.log("Saved account data expired");
      clearSavedAccount();
      return null;
    }

    return {
      username: config.savedAccount.username,
      encryptedPassword: config.savedAccount.encryptedPassword,
    };
  } catch (error) {
    console.error("Error loading saved account:", error);
    clearSavedAccount();
    return null;
  }
}
function clearSavedAccount() {
  try {
    if (!fs.existsSync(configPath)) return;

    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    delete config.savedAccount;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error clearing saved account:", error);
  }
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    resizable: true,
    minWidth: 1200,
    minHeight: 800,
    // autoHideMenuBar: true,
    icon: path.join(__dirname, "renderer/images/ico.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, "preload.js"),
    },
    frame: true,
    titleBarStyle: "default",
  });
  // mainWindow.setMenu(null);
  updater = new LauncherUpdater(mainWindow);

  checkGameStatus()
    .then((status) => {
      mainWindow.webContents.on("did-finish-load", () => {
        sendLogToRenderer("Лаунчер загружен успешно!");
        sendLogToRenderer(
          `Статус клиента: ${
            status.clientInstalled ? "установлен" : "не установлен"
          }`,
          "info"
        );
        if (status.details) {
          sendLogToRenderer(
            `Детали: Vanilla=${status.details.vanilla}, Fabric=${status.details.fabric}`,
            "info"
          );
        }
        mainWindow.webContents.send("installation-status", status);
      });
    })
    .catch((error) => {
      sendLogToRenderer(`Ошибка проверки статуса: ${error.message}`, "error");
    });
  setTimeout(() => {
    updater.startAutoCheck();
  }, 5000);
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
      error: error.message,
    };
  }
});

ipcMain.handle(
  "auth-request",
  async (_, { username, password, rememberMe = false }) => {
    try {
      const response = await fetch("http://95.79.192.194:3000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.success) {
        currentUsername = username;

        const saved = saveAccountData(username, password, rememberMe);

        if (saved) {
          sendLogToRenderer(`Данные аккаунта ${username} сохранены`, "info");
        } else if (rememberMe) {
          sendLogToRenderer("Не удалось сохранить данные аккаунта", "warning");
        }

        return {
          success: true,
          username,
          access: "навсегда",
          remembered: saved,
        };
      }
      return data;
    } catch (error) {
      return {
        success: false,
        message: "Ошибка соединения с сервером авторизации",
      };
    }
  }
);

ipcMain.handle("get-current-user", () => {
  return currentUsername ? { username: currentUsername } : null;
});

ipcMain.handle("install-client", async (event, options = {}) => {
  try {
    if (!currentUsername) {
      throw new Error("Пользователь не авторизован");
    }

    sendLogToRenderer(
      `Начинается установка клиента для ${currentUsername}...`,
      "info"
    );

    const installOptions = {
      ...options,
      fov: options.fov || "90.0",
      renderDistance: options.renderDistance || "12",
      maxFps: options.maxFps || "120",
      language: options.language || "ru_ru",
      autoConnectServer: options.autoConnectServer || false,
      modpack: options.modpack || "ULTRA",
    };

    const result = await installClient(
      currentUsername,
      installOptions,
      sendLogToRenderer
    );
    sendLogToRenderer("Установка клиента завершена успешно!", "success");

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
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }

    const { savedAccount } = config;
    Object.assign(config, settings);
    if (savedAccount) {
      config.savedAccount = savedAccount;
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
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
    return {
      maxMemory: "4G",
      minMemory: "2G",
      javaPath: "(Автоматически)",
      modpack: "ULTRA",
    };
  } catch (error) {
    return {
      maxMemory: "4G",
      minMemory: "2G",
      javaPath: "(Автоматически)",
      modpack: "ULTRA",
    };
  }
});
ipcMain.handle("check-updates", async () => {
  if (updater) {
    return await updater.checkForUpdates(true);
  }
  return { available: false, error: "Updater not initialized" };
});

ipcMain.handle("download-update", async (_, downloadUrl, fileName) => {
  if (updater) {
    try {
      let lastProgress = -1;
      updater.onDownloadProgress = (progress) => {
        if (progress !== lastProgress) {
          lastProgress = progress;
          mainWindow.webContents.send("update-progress", progress);

          if (progress % 10 === 0) {
            sendLogToRenderer(`Прогресс загрузки: ${progress}%`, "info");
          }
        }
      };

      sendLogToRenderer("Начинается загрузка обновления...", "info");
      const result = await updater.downloadAndInstall(downloadUrl, fileName);

      if (result.success) {
        sendLogToRenderer(
          "Обновление успешно загружено и установлено",
          "success"
        );
      }

      return result;
    } catch (error) {
      sendLogToRenderer(
        `Ошибка загрузки обновления: ${error.message}`,
        "error"
      );
      return { success: false, error: error.message };
    } finally {
      updater.onDownloadProgress = null;
    }
  }
  return { success: false, error: "Updater not initialized" };
});

ipcMain.handle("skip-update-version", async (_, version) => {
  try {
    ensureConfigDirectoryExists();
    const config = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath))
      : {};
    config.skippedVersion = version;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
ipcMain.handle("check-system-java", async () => {
  const { exec } = require("child_process");
  const util = require("util");
  const execPromise = util.promisify(exec);

  try {
    const { stdout, stderr } = await execPromise("java -version");
    const versionOutput = stdout + stderr;
    const versionMatch = versionOutput.match(/version\s+"?(\d+)(\.\d+\.\d+)?/);

    if (versionMatch) {
      return {
        version: parseInt(versionMatch[1]),
        path: "java",
      };
    }
  } catch (error) {
    return null;
  }
});

ipcMain.handle("get-system-info", async () => {
  const os = require("os");
  return {
    totalMemory: Math.floor(os.totalmem() / (1024 * 1024 * 1024)),
  };
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
ipcMain.handle("get-saved-account", async () => {
  try {
    const savedAccount = loadSavedAccount();
    if (savedAccount) {
      return {
        username: savedAccount.username,
        hasPassword: true,
      };
    }
    return null;
  } catch (error) {
    return null;
  }
});
ipcMain.handle("auto-login", async () => {
  try {
    const savedAccount = loadSavedAccount();
    if (!savedAccount) {
      return {
        success: false,
        message: "Нет сохраненных данных аккаунта",
      };
    }

    const decryptedPassword = decryptPassword(savedAccount.encryptedPassword);
    if (!decryptedPassword) {
      clearSavedAccount();
      return {
        success: false,
        message: "Не удалось расшифровать пароль",
      };
    }

    const response = await fetch("http://95.79.192.194:3000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: savedAccount.username,
        password: decryptedPassword,
      }),
    });

    const data = await response.json();

    if (data.success) {
      currentUsername = savedAccount.username;
      sendLogToRenderer(
        `Автоавторизация для ${savedAccount.username}`,
        "success"
      );

      return {
        success: true,
        username: savedAccount.username,
        access: "навсегда",
        autoLogin: true,
      };
    } else {
      clearSavedAccount();
      return {
        success: false,
        message: "Сохраненный пароль неверный",
      };
    }
  } catch (error) {
    clearSavedAccount();
    return {
      success: false,
      message: "Ошибка автоавторизации",
    };
  }
});
ipcMain.handle("clear-saved-account", async () => {
  try {
    clearSavedAccount();
    currentUsername = null;
    sendLogToRenderer("Сохраненные данные аккаунта удалены", "info");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  sendLogToRenderer(`Критическая ошибка: ${error.message}`, "error");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  sendLogToRenderer(`Необработанная ошибка: ${reason}`, "error");
});
