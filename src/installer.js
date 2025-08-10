const { Client } = require("minecraft-launcher-core");
const path = require("path");
const fs = require("fs");
const https = require("https");
const os = require("os");
const AdmZip = require("adm-zip");
const { VERSION_CONFIG } = require("./launcher");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

const launcher = new Client();
const mcRoot = path.join(os.homedir(), "AppData", "Roaming", ".shampuneum");
const javaRoot = path.join(mcRoot, "java");
const javaDefaultPath = path.join(javaRoot, "jdk-24.0.2", "bin", os.platform() === "win32" ? "javaw.exe" : "java");

const MODPACKS = {
  ULTRA: {
    url: "http://dl.dropboxusercontent.com/scl/fi/qbczpjhzclp2ytf1iyih4/shampuneum-medium.zip?rlkey=uf7ehogdq3kstucguydhpx0v3&e=2&st=jo8hkgp9&dl=1",
    fileName: "modpack-ultra.zip",
  },
  MEDIUM: {
    url: "http://dl.dropboxusercontent.com/scl/fi/qbczpjhzclp2ytf1iyih4/shampuneum-medium.zip?rlkey=uf7ehogdq3kstucguydhpx0v3&e=2&st=jo8hkgp9&dl=1",
    fileName: "shampuneum-medium.zip",
  },
  LOW: {
    url: "http://dl.dropboxusercontent.com/scl/fi/qbczpjhzclp2ytf1iyih4/shampuneum-medium.zip?rlkey=uf7ehogdq3kstucguydhpx0v3&e=2&st=jo8hkgp9&dl=1",
    fileName: "modpack-low.zip",
  },
};

const JAVA_DOWNLOAD_URLS = {
  win32: "https://download.java.net/java/GA/jdk24.0.2/fdc5d0102fe0414db21410ad5834341f/12/GPL/openjdk-24.0.2_windows-x64_bin.zip",
  darwin: "https://download.java.net/java/GA/jdk24.0.2/fdc5d0102fe0414db21410ad5834341f/12/GPL/openjdk-24.0.2_macos-x64_bin.tar.gz",
  linux: "https://download.java.net/java/GA/jdk24.0.2/fdc5d0102fe0414db21410ad5834341f/12/GPL/openjdk-24.0.2_linux-x64_bin.tar.gz",
};

function ensureDirectoryExists(dir) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (error) {
    throw new Error(`Нет прав на запись в директорию ${dir}: ${error.message}`);
  }
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function checkJavaVersion(javaPath, sendLogToRenderer) {
  try {
    const { stdout, stderr } = await execPromise(`"${javaPath}" -version`);
    const versionMatch = (stdout + stderr).match(/version\s+"?(\d+)(\.\d+\.\d+)?/);
    if (!versionMatch) {
      sendLogToRenderer("Не удалось определить версию Java", "error");
      return false;
    }

    const majorVersion = parseInt(versionMatch[1]);
    const isCompatible = majorVersion >= 21;

    sendLogToRenderer(`Обнаружена Java версии ${majorVersion} ${isCompatible ? '(совместима)' : '(несовместима, нужна 21+)'}`,
      isCompatible ? "success" : "warning");

    return isCompatible;
  } catch (error) {
    sendLogToRenderer(`Ошибка проверки Java: ${error.message}`, "error");
    return false;
  }
}

async function downloadJava(sendLogToRenderer) {
  const platform = os.platform();
  const javaUrl = JAVA_DOWNLOAD_URLS[platform];

  if (!javaUrl) {
    sendLogToRenderer(`Платформа ${platform} не поддерживается`, "error");
    throw new Error(`Платформа не поддерживается: ${platform}`);
  }

  try {
    const { stdout, stderr } = await execPromise('java -version');
    const versionMatch = (stdout + stderr).match(/version\s+"?(\d+)(\.\d+\.\d+)?/);

    if (versionMatch) {
      const majorVersion = parseInt(versionMatch[1]);
      if (majorVersion >= 21) {
        sendLogToRenderer(`Используется системная Java ${majorVersion}`, "success");
        return 'java'; 
      } else {
        sendLogToRenderer(`Системная Java ${majorVersion} устарела, устанавливаем Java 24`, "info");
      }
    }
  } catch (error) {
    sendLogToRenderer("Системная Java не найдена, устанавливаем Java 24", "info");
  }

  ensureDirectoryExists(javaRoot);
  if (fs.existsSync(javaDefaultPath)) {
    if (await checkJavaVersion(javaDefaultPath, sendLogToRenderer)) {
      sendLogToRenderer("Java 24 уже установлена", "info");
      return javaDefaultPath;
    }
  }

  const javaArchivePath = path.join(javaRoot, `jdk-24.${platform === 'win32' ? 'zip' : 'tar.gz'}`);

  sendLogToRenderer("Скачивание Java 24...", "info");
  await downloadFile(javaUrl, javaArchivePath);

  sendLogToRenderer("Распаковка Java...", "info");
  try {
    if (platform === "win32") {
      const zip = new AdmZip(javaArchivePath);
      zip.extractAllTo(javaRoot, true);
    } else {
      await execPromise(`tar -xzf "${javaArchivePath}" -C "${javaRoot}"`);
    }
    fs.unlinkSync(javaArchivePath);
  } catch (error) {
    sendLogToRenderer(`Ошибка распаковки Java: ${error.message}`, "error");
    throw error;
  }

  if (await checkJavaVersion(javaDefaultPath, sendLogToRenderer)) {
    sendLogToRenderer("Java 24 успешно установлена", "success");
    return javaDefaultPath;
  }

  throw new Error("Не удалось установить подходящую версию Java");
}

function downloadFile(url, filePath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Превышено количество редиректов"));
      return;
    }

    const protocol = url.startsWith("https") ? require("https") : require("http");
    const file = fs.createWriteStream(filePath);

    protocol
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          fs.unlink(filePath, () => { });
          const newUrl = response.headers.location.startsWith("http")
            ? response.headers.location
            : new URL(response.headers.location, url).href;
          downloadFile(newUrl, filePath, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(filePath, () => { });
          reject(new Error(`HTTP ${response.statusCode}: ${url}`));
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          const stats = fs.statSync(filePath);
          if (stats.size < 100) {
            fs.unlinkSync(filePath);
            reject(new Error(`Файл слишком мал: ${stats.size} байт`));
            return;
          }
          resolve();
        });

        file.on("error", (error) => {
          fs.unlink(filePath, () => { });
          reject(error);
        });
      })
      .on("error", (error) => {
        file.close();
        fs.unlink(filePath, () => { });
        reject(error);
      });
  });
}

async function installClient(username = "Player", options = {}, sendLogToRenderer = console.log) {
  return new Promise(async (resolve, reject) => {
    const version = "1.21.8";
    const versionConfig = VERSION_CONFIG[version];

    if (!versionConfig) {
      sendLogToRenderer(`Неподдерживаемая версия: ${version}`, "error");
      reject(new Error(`Неподдерживаемая версия: ${version}`));
      return;
    }

    sendLogToRenderer(`Проверка Java перед установкой...`, "info");
    let javaPath;
    try {
      javaPath = options.javaPath && options.javaPath !== "(Автоматически)"
        ? options.javaPath
        : await downloadJava(sendLogToRenderer);
    } catch (error) {
      sendLogToRenderer(`Ошибка установки Java: ${error.message}`, "error");
      reject(error);
      return;
    }

    sendLogToRenderer(`Начинается установка версии: ${version}`, "info");
    ensureDirectoryExists(mcRoot);

    let modpackType = options.modpack || "ULTRA";
    if (modpackType.startsWith("1.21.8-")) {
      modpackType = modpackType.replace("1.21.8-", "").toUpperCase();
    }

    const installOptions = {
      authorization: {
        access_token: "0",
        client_token: "0",
        uuid: generateUUID(),
        name: username,
        user_type: "legacy",
      },
      root: mcRoot,
      version: {
        number: versionConfig.number,
        type: versionConfig.type,
      },
      memory: {
        max: options.maxMemory || "4G",
        min: options.minMemory || "2G",
      },
      forge: false,
      detached: false,
      javaPath: javaPath,
      installOnly: true,
      username: username,
      modpack: modpackType,
    };

    if (versionConfig.fabric) {
      installOptions.fabric = {
        version: versionConfig.fabric,
      };
    }

    installMinecraftVersion(installOptions, sendLogToRenderer)
      .then(() => downloadAdditionalFiles(version, installOptions, sendLogToRenderer))
      .then(() => createConfigFiles(version, options))
      .then(() => {
        sendLogToRenderer("Установка полностью завершена", "success");
        resolve({
          success: true,
          version: version,
          path: mcRoot,
          message: "Установка завершена успешно!",
          modpack: installOptions.modpack,
          javaPath: javaPath,
        });
      })
      .catch((error) => {
        sendLogToRenderer(`Ошибка установки: ${error.message}`, "error");
        reject(error);
      });
  });
}

function installMinecraftVersion(options, sendLogToRenderer) {
  return new Promise((resolve, reject) => {
    const version = options.version.number;

    sendLogToRenderer(`Загрузка версии ${version}`, "info");

    downloadVersionManifest(version)
      .then(() => downloadVersionJar(version))
      .then(() => downloadLibraries(version))
      .then(() => {
        if (options.fabric) {
          return installFabric(version, options.fabric.version, sendLogToRenderer);
        }
        return Promise.resolve();
      })
      .then(() => {
        sendLogToRenderer(`Установка ${version} завершена`, "success");
        resolve();
      })
      .catch(reject);
  });
}

function downloadVersionManifest(version) {
  return new Promise((resolve, reject) => {
    const versionDir = path.join(mcRoot, "versions", version);
    ensureDirectoryExists(versionDir);

    const manifestUrl = `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`;

    https
      .get(manifestUrl, (response) => {
        let data = "";
        response.on("data", (chunk) => (data += chunk));
        response.on("end", () => {
          try {
            const manifest = JSON.parse(data);
            const versionInfo = manifest.versions.find((v) => v.id === version);

            if (!versionInfo) {
              reject(new Error(`Версия ${version} не найдена`));
              return;
            }

            https
              .get(versionInfo.url, (versionResponse) => {
                let versionData = "";
                versionResponse.on("data", (chunk) => (versionData += chunk));
                versionResponse.on("end", () => {
                  const versionJsonPath = path.join(versionDir, `${version}.json`);
                  fs.writeFileSync(versionJsonPath, versionData);
                  resolve();
                });
              })
              .on("error", reject);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function downloadVersionJar(version) {
  return new Promise((resolve, reject) => {
    const versionDir = path.join(mcRoot, "versions", version);
    const versionJsonPath = path.join(versionDir, `${version}.json`);
    const jarPath = path.join(versionDir, `${version}.jar`);

    if (fs.existsSync(jarPath)) {
      resolve();
      return;
    }

    try {
      const versionData = JSON.parse(fs.readFileSync(versionJsonPath, "utf8"));
      const jarUrl = versionData.downloads.client.url;

      downloadFile(jarUrl, jarPath).then(resolve).catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

function downloadLibraries(version) {
  return new Promise((resolve, reject) => {
    const versionDir = path.join(mcRoot, "versions", version);
    const versionJsonPath = path.join(versionDir, `${version}.json`);
    const librariesDir = path.join(mcRoot, "libraries");

    try {
      const versionData = JSON.parse(fs.readFileSync(versionJsonPath, "utf8"));
      const libraries = versionData.libraries || [];

      const downloadPromises = libraries.map((library) => {
        if (library.downloads && library.downloads.artifact) {
          const artifact = library.downloads.artifact;
          const libraryPath = path.join(librariesDir, artifact.path);

          ensureDirectoryExists(path.dirname(libraryPath));

          if (fs.existsSync(libraryPath)) {
            return Promise.resolve();
          }

          return downloadFile(artifact.url, libraryPath);
        }
        return Promise.resolve();
      });

      Promise.all(downloadPromises)
        .then(() => resolve())
        .catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

function installFabric(version, fabricVersion, sendLogToRenderer) {
  return new Promise((resolve, reject) => {
    const fabricVersionName = `fabric-loader-${fabricVersion}-${version}`;
    const fabricVersionDir = path.join(mcRoot, "versions", fabricVersionName);
    const fabricJsonPath = path.join(fabricVersionDir, `${fabricVersionName}.json`);
    const fabricJarPath = path.join(fabricVersionDir, `${fabricVersionName}.jar`);
    const originalJarPath = path.join(mcRoot, "versions", version, `${version}.jar`);

    ensureDirectoryExists(fabricVersionDir);

    if (!fs.existsSync(originalJarPath)) {
      reject(new Error(`Оригинальный JAR Minecraft ${version} не найден`));
      return;
    }

    const metadataUrl = `https://meta.fabricmc.net/v2/versions/loader/${version}/${fabricVersion}/profile/json`;

    https
      .get(metadataUrl, (response) => {
        let data = "";
        response.on("data", (chunk) => (data += chunk));
        response.on("end", () => {
          try {
            const fabricProfile = JSON.parse(data);
            fs.writeFileSync(fabricJsonPath, JSON.stringify(fabricProfile, null, 2));
            fs.copyFileSync(originalJarPath, fabricJarPath);

            downloadFabricLibraries(fabricProfile)
              .then(() => resolve())
              .catch(reject);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function downloadFabricLibraries(fabricProfile) {
  return new Promise((resolve, reject) => {
    const librariesDir = path.join(mcRoot, "libraries");
    const libraries = fabricProfile.libraries || [];

    const downloadPromises = libraries.map((library) => {
      if (library.downloads && library.downloads.artifact) {
        const artifact = library.downloads.artifact;
        const libraryPath = path.join(librariesDir, artifact.path);

        ensureDirectoryExists(path.dirname(libraryPath));

        if (fs.existsSync(libraryPath)) {
          return Promise.resolve();
        }

        return downloadFile(artifact.url, libraryPath);
      }
      return Promise.resolve();
    });

    Promise.all(downloadPromises)
      .then(() => resolve())
      .catch(reject);
  });
}

function downloadAdditionalFiles(version, options, sendLogToRenderer) {
  return new Promise((resolve, reject) => {
    const promises = [
      downloadResourcePack(sendLogToRenderer),
      downloadModpack(options.modpack, sendLogToRenderer),
    ];

    Promise.all(promises)
      .then(() => resolve())
      .catch((error) => {
        sendLogToRenderer(`Ошибка загрузки дополнительных файлов: ${error.message}`, "error");
        reject(error);
      });
  });
}

function downloadResourcePack(sendLogToRenderer) {
  return new Promise((resolve, reject) => {
    const resourcePacksDir = path.join(mcRoot, "resourcepacks");
    ensureDirectoryExists(resourcePacksDir);

    const resourcePackPath = path.join(resourcePacksDir, "Shampuneum.zip");
    const fileId = "17gwAudZ9rErh4v6jiGcHA-2xyJXeJL5I";
    const resourcePackUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;

    sendLogToRenderer("Загрузка ресурспака...", "info");

    downloadFile(resourcePackUrl, resourcePackPath)
      .then(() => {
        sendLogToRenderer("Ресурспак загружен", "success");
        resolve();
      })
      .catch((error) => {
        sendLogToRenderer(`Ошибка загрузки ресурспака: ${error.message}`, "error");
        resolve();
      });
  });
}

function downloadModpack(modpackType, sendLogToRenderer) {
  return new Promise((resolve, reject) => {
    const modsDir = path.join(mcRoot, "mods");
    ensureDirectoryExists(modsDir);

    const modpack = MODPACKS[modpackType];
    if (!modpack) {
      sendLogToRenderer(`Неподдерживаемый модпак: ${modpackType}`, "error");
      reject(new Error(`Неподдерживаемый модпак: ${modpackType}`));
      return;
    }

    const modpackPath = path.join(mcRoot, modpack.fileName);
    const modpackUrl = modpack.url;

    sendLogToRenderer(`Загрузка модпака ${modpackType} с ${modpackUrl}...`, "info");

    downloadFile(modpackUrl, modpackPath)
      .then(() => {
        sendLogToRenderer(`Разархивирование модпака ${modpackType}...`, "info");
        try {
          if (fs.existsSync(modsDir)) {
            fs.rmSync(modsDir, { recursive: true, force: true });
          }
          ensureDirectoryExists(modsDir);

          const zip = new AdmZip(modpackPath);
          zip.extractAllTo(modsDir, true);
          fs.unlinkSync(modpackPath);
          sendLogToRenderer(`Модпак ${modpackType} успешно установлен`, "success");
          resolve();
        } catch (error) {
          sendLogToRenderer(`Ошибка разархивирования модпака: ${error.message}`, "error");
          reject(error);
        }
      })
      .catch((error) => {
        sendLogToRenderer(`Ошибка загрузки модпака: ${error.message}`, "error");
        reject(error);
      });
  });
}

function createConfigFiles(version, options = {}) {
  return new Promise((resolve) => {
    const configDir = path.join(mcRoot, "config");
    ensureDirectoryExists(configDir);

    const optionsFile = path.join(mcRoot, "options.txt");
    const defaultOptions = `version:3465
autoJump:false
enableVsync:true
fov:${options.fov || "90.0"}
renderDistance:${options.renderDistance || "12"}
maxFps:${options.maxFps || "120"}
resourcePacks:["vanilla","Shampuneum.zip"]
lang:${options.language || "ru_ru"}
lastServer:${options.autoConnectServer ? "shampuneum.net:25565" : ""}`;

    fs.writeFileSync(optionsFile, defaultOptions);

    const serversFile = path.join(mcRoot, "servers.dat");
    fs.writeFileSync(serversFile, "");

    resolve();
  });
}

function verifyInstallation(version) {
  return new Promise((resolve) => {
    const versionDir = path.join(mcRoot, "versions", version);
    const jarFile = path.join(versionDir, `${version}.jar`);
    const jsonFile = path.join(versionDir, `${version}.json`);

    resolve(fs.existsSync(jarFile) && fs.existsSync(jsonFile));
  });
}

function cleanupInstallation() {
  return new Promise((resolve, reject) => {
    try {
      if (fs.existsSync(mcRoot)) {
        fs.rmSync(mcRoot, { recursive: true, force: true });
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  installClient,
  verifyInstallation,
  cleanupInstallation,
  createConfigFiles,
};