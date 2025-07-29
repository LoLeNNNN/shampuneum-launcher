const { Client } = require("minecraft-launcher-core");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

const launcher = new Client();
const mcRoot = path.join(os.homedir(), "AppData", "Roaming", ".shampuneum");

const VERSION_CONFIG = {
  "1.21.8": {
    number: "1.21.8",
    type: "release",
    fabric: "0.16.14",
  },
};

function generateOfflineUUID(username) {
  const md5 = crypto.createHash("md5");
  return md5
    .update(`OfflinePlayer:${username}`)
    .digest("hex")
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

function launchMinecraft(username, options = {}) {
  return new Promise((resolve, reject) => {
    const version = options.version || "1.21.8";
    const versionConfig = VERSION_CONFIG[version];

    if (!versionConfig) {
      reject(new Error(`Неподдерживаемая версия: ${version}`));
      return;
    }

    if (!fs.existsSync(mcRoot)) {
      reject(new Error("Клиент не установлен. Сначала выполните установку."));
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
      reject(new Error("Ник должен содержать 3-16 символов (a-z, 0-9, _)"));
      return;
    }

    const fabricVersion = versionConfig.fabric
      ? `fabric-loader-${versionConfig.fabric}-${version}`
      : version;
    const versionDir = path.join(mcRoot, "versions", fabricVersion);
    const jarFile = path.join(versionDir, `${fabricVersion}.jar`);
    const jsonFile = path.join(versionDir, `${fabricVersion}.json`);

    if (!fs.existsSync(jarFile) || !fs.existsSync(jsonFile)) {
      reject(new Error(`Версия ${fabricVersion} не найдена. Переустановите клиент.`));
      return;
    }

    const launchOptions = {
      authorization: {
        access_token: "0",
        client_token: "0",
        uuid: generateOfflineUUID(username),
        name: username,
        user_type: "legacy",
      },
      root: mcRoot,
      version: {
        number: versionConfig.number,
        type: versionConfig.type,
        custom: fabricVersion,
      },
      memory: {
        max: options.maxMemory || "4G",
        min: options.minMemory || "2G",
      },
      forge: false,
      detached: true,
      javaPath: options.javaPath || undefined,
      customArgs: options.customArgs || [],
    };

    if (versionConfig.fabric) {
      launchOptions.fabric = {
        version: versionConfig.fabric,
      };
    }

    if (options.useAdmin) {
      launchOptions.customArgs.push("--server=shampuneum.net", "--port=25565");
    }

    launcher
      .launch(launchOptions)
      .then((proc) => {
        if (!proc) {
          reject(new Error("Не удалось запустить Minecraft (процесс не создан)"));
          return;
        }

        resolve({
          success: true,
          pid: proc.pid,
          username: username,
          version: version,
          isFabric: !!versionConfig.fabric,
        });
      })
      .catch(reject);
  });
}

function checkGameStatus() {
  return new Promise((resolve) => {
    const clientExists = fs.existsSync(mcRoot);
    let versionsExist = false;
    let versionValid = false;

    if (clientExists) {
      const versionDir = path.join(mcRoot, "versions", "1.21.8");
      const jarFile = path.join(versionDir, "1.21.8.jar");
      const jsonFile = path.join(versionDir, "1.21.8.json");
      versionsExist = fs.existsSync(path.join(mcRoot, "versions"));
      versionValid = fs.existsSync(jarFile) && fs.existsSync(jsonFile);
    }

    resolve({
      clientInstalled: clientExists && versionsExist && versionValid,
      versionsAvailable: versionsExist,
      clientPath: mcRoot,
    });
  });
}

function getAvailableVersions() {
  return Object.keys(VERSION_CONFIG);
}

module.exports = {
  launchMinecraft,
  checkGameStatus,
  getAvailableVersions,
  VERSION_CONFIG,
};