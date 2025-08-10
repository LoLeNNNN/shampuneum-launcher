const { app } = require("electron");
const fetch = require("node-fetch");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const { Readable } = require("stream");
const https = require("https");

class LauncherUpdater {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.currentVersion = app.getVersion();

    this.config = {
      githubRepo: "LOLENNNN/shampuneum-launcher",
      checkInterval: 30 * 60 * 1000,
      autoCheck: true,
      preferPortable: true,
    };
  }

  async checkGitHubUpdates() {
    return new Promise((resolve, reject) => {
      const url = `https://api.github.com/repos/${this.config.githubRepo}/releases/latest`;

      https
        .get(
          url,
          {
            headers: {
              "User-Agent": "Shampuneum-Launcher",
              Accept: "application/vnd.github.v3+json",
            },
          },
          (response) => {
            let data = "";

            response.on("data", (chunk) => (data += chunk));
            response.on("end", () => {
              try {
                if (response.statusCode !== 200) {
                  console.log("Ответ API:", response.statusCode, data);
                  reject(
                    new Error(`Ошибка API GitHub: HTTP ${response.statusCode}`)
                  );
                  return;
                }

                const release = JSON.parse(data);
                console.log("Данные релиза:", release);

                if (!release || !release.tag_name) {
                  console.log(
                    "Ошибка: release или tag_name отсутствует",
                    release
                  );
                  reject(
                    new Error("Ответ GitHub не содержит tag_name или release")
                  );
                  return;
                }

                if (release.draft || release.prerelease) {
                  resolve({ available: false });
                  return;
                }

                const latestVersion = release.tag_name.replace(/^v/, "");

                const configPath = path.join(
                  os.homedir(),
                  "AppData",
                  "Roaming",
                  ".shampuneum",
                  "config.json"
                );
                let skippedVersion = null;
                if (fs.existsSync(configPath)) {
                  const config = JSON.parse(fs.readFileSync(configPath));
                  skippedVersion = config.skippedVersion;
                }
                if (
                  skippedVersion &&
                  this.compareVersions(latestVersion, skippedVersion) === 0
                ) {
                  console.log(
                    `Версия ${latestVersion} пропущена пользователем`
                  );
                  resolve({ available: false });
                  return;
                }

                if (
                  this.compareVersions(latestVersion, this.currentVersion) > 0
                ) {
                  let asset = null;

                  if (this.config.preferPortable) {
                    asset = release.assets.find(
                      (a) =>
                        a.name.toLowerCase().includes("portable") &&
                        a.name.toLowerCase().includes("exe")
                    );
                  }

                  if (!asset) {
                    asset = release.assets.find(
                      (a) =>
                        (a.name.toLowerCase().includes("win") ||
                          a.name.endsWith(".exe") ||
                          a.name.endsWith(".zip")) &&
                        !a.name.includes("blockmap") &&
                        !a.name.includes("latest.yml")
                    );
                  }

                  if (!asset) {
                    reject(new Error("Подходящий файл обновления не найден"));
                    return;
                  }

                  resolve({
                    available: true,
                    version: latestVersion,
                    downloadUrl: asset.browser_download_url,
                    changelog: this.parseChangelog(release.body || ""),
                    size: this.formatBytes(asset.size),
                    fileName: asset.name,
                    publishDate: new Date(
                      release.published_at
                    ).toLocaleDateString("ru-RU"),
                    isPortable: asset.name.toLowerCase().includes("portable"),
                  });
                } else {
                  resolve({ available: false });
                }
              } catch (error) {
                console.error("Ошибка парсинга:", error.message);
                reject(
                  new Error(`Ошибка парсинга ответа GitHub: ${error.message}`)
                );
              }
            });
          }
        )
        .on("error", (error) => {
          console.error("Ошибка сети:", error.message);
          reject(
            new Error(`Ошибка сети при проверке обновлений: ${error.message}`)
          );
        });
    });
  }

  startAutoCheck() {
    const check = async () => {
      try {
        const update = await this.checkGitHubUpdates();
        if (update.available) {
          console.log("Отправка update-available:", update);
          this.mainWindow.webContents.send("update-available", update);
        }
      } catch (error) {
        console.error("Ошибка в startAutoCheck:", error.message);
        this.mainWindow.webContents.send("log-message", {
          message: `Ошибка проверки обновлений: ${error.message}`,
          type: "error",
        });
      }
    };

    check();
    setInterval(check, this.config.checkInterval);
  }

  compareVersions(latestVersion, currentVersion) {
    const parseVersion = (version) => version.split(".").map(Number);
    const latest = parseVersion(latestVersion);
    const current = parseVersion(currentVersion);

    for (let i = 0; i < Math.max(latest.length, current.length); i++) {
      const latestPart = latest[i] || 0;
      const currentPart = current[i] || 0;
      if (latestPart > currentPart) return 1;
      if (latestPart < currentPart) return -1;
    }
    return 0;
  }

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  async downloadAndInstall(downloadUrl, fileName, retries = 3) {
    return new Promise(async (resolve, reject) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          // Создаем временную папку для загрузки
          const tempDir = path.join(os.tmpdir(), "shampuneum-updater");
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          const filePath = path.join(tempDir, fileName);
          const logPath = path.join(tempDir, "update_log.txt");

          this.mainWindow.webContents.send("log-message", {
            message: `Попытка загрузки ${attempt}/${retries}...`,
            type: "info",
          });

          // Проверяем права доступа к временной папке
          try {
            fs.accessSync(tempDir, fs.constants.W_OK);
          } catch (error) {
            throw new Error(`Нет прав на запись в ${tempDir}: ${error.message}`);
          }

          // Загружаем файл
          const response = await fetch(downloadUrl, {
            headers: {
              "User-Agent": "Shampuneum-Launcher/1.0",
              Accept: "application/octet-stream",
              "Cache-Control": "no-cache",
            },
            timeout: 120000, // 2 минуты таймаут
          });

          if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
          }

          const contentLength = parseInt(response.headers.get("content-length"), 10);
          let downloadedBytes = 0;

          // Создаем поток для записи файла
          const fileStream = fs.createWriteStream(filePath);

          // Обработка потока загрузки
          await new Promise((resolveStream, rejectStream) => {
            response.body.pipe(fileStream);

            response.body.on("error", (error) => {
              fileStream.destroy();
              rejectStream(error);
            });

            fileStream.on("finish", () => {
              downloadedBytes = fs.statSync(filePath).size;
              resolveStream();
            });

            fileStream.on("error", (error) => {
              rejectStream(error);
            });
          });

          this.mainWindow.webContents.send("log-message", {
            message: `Загрузка завершена: ${this.formatBytes(downloadedBytes)}`,
            type: "success",
          });

          // Проверка целостности файла
          if (contentLength && downloadedBytes !== contentLength) {
            throw new Error(`Неполная загрузка: получено ${downloadedBytes} из ${contentLength} байт`);
          }

          if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
            throw new Error("Загруженный файл поврежден или пустой");
          }

          const appPath = path.dirname(process.execPath);
          const currentExePath = process.execPath;
          const targetExeName = "shampuneum-launcher.exe";
          const targetExePath = path.join(appPath, targetExeName);

          try {
            fs.accessSync(appPath, fs.constants.W_OK);
          } catch (error) {
            throw new Error(`Нет прав на запись в ${appPath}: ${error.message}`);
          }

          if (fileName.toLowerCase().endsWith(".exe")) {
            const batPath = path.join(tempDir, "update.bat");
            const batContent = `
@echo off
echo Начало обновления... >> "${logPath}"
echo Новый файл: ${filePath} >> "${logPath}"
echo Целевой файл: ${targetExePath} >> "${logPath}"
taskkill /IM "${targetExeName}" /F >> "${logPath}" 2>&1
copy "${filePath}" "${appPath}\\new-shampuneum-launcher.exe" >> "${logPath}" 2>&1
if exist "${appPath}\\new-shampuneum-launcher.exe" (
  del "${targetExePath}" >> "${logPath}" 2>&1
  ren "${appPath}\\new-shampuneum-launcher.exe" "${targetExeName}" >> "${logPath}" 2>&1
  if exist "${targetExePath}" (
    echo Успешно обновлено >> "${logPath}"
    start "" "${targetExePath}"
    del "${filePath}" >> "${logPath}" 2>&1
    del "%~f0" >> "${logPath}" 2>&1
  ) else (
    echo Ошибка: Не удалось переименовать файл >> "${logPath}"
    exit /b 1
  )
) else (
  echo Ошибка: Не удалось скопировать новый файл >> "${logPath}"
  exit /b 1
)
`;

            await fs.writeFile(batPath, batContent, "utf8");

            if (!fs.existsSync(batPath)) {
              throw new Error(`Не удалось создать батник: ${batPath}`);
            }

            this.mainWindow.webContents.send("log-message", {
              message: `Батник создан: ${batPath}`,
              type: "success",
            });

            // Запускаем батник
            const command = `start /B cmd /c "${batPath}"`;
            exec(command, (error) => {
              if (error) {
                console.error("Ошибка запуска батника:", error);
                this.mainWindow.webContents.send("log-message", {
                  message: `Ошибка запуска батника: ${error.message}`,
                  type: "error",
                });
              }
            });

            // Закрываем приложение
            setTimeout(() => {
              app.quit();
            }, 1000);

            resolve({ success: true });
          } else if (fileName.toLowerCase().endsWith(".zip")) {
            try {
              const AdmZip = require("adm-zip");
              const zip = new AdmZip(filePath);
              const extractPath = path.join(tempDir, "extracted");

              this.mainWindow.webContents.send("log-message", {
                message: "Извлечение архива...",
                type: "info",
              });

              zip.extractAllTo(extractPath, true);

              await fs.copy(extractPath, appPath, {
                overwrite: true,
                preserveTimestamps: false,
              });

              this.mainWindow.webContents.send("log-message", {
                message: "Обновление установлено! Перезапустите приложение",
                type: "success",
              });

              resolve({ success: true });
            } catch (zipError) {
              throw new Error(`Ошибка извлечения архива: ${zipError.message}`);
            }
          } else {
            throw new Error(`Неподдерживаемый тип файла: ${fileName}`);
          }
          break;
        } catch (error) {
          this.mainWindow.webContents.send("log-message", {
            message: `Попытка ${attempt} не удалась: ${error.message}`,
            type: "error",
          });

          // Очищаем поврежденный файл
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (cleanupError) {
            console.error("Ошибка очистки:", cleanupError);
          }

          if (attempt === retries) {
            reject(new Error(`Не удалось загрузить после ${retries} попыток: ${error.message}`));
          }

          await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
        }
      }
    });
  }

  parseChangelog(markdown) {
    if (!markdown) return "Информация об изменениях недоступна";

    return markdown
      .replace(/#{1,6}\s+/g, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`(.*?)`/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .trim();
  }
}

module.exports = LauncherUpdater;