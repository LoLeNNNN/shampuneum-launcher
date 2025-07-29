const { Client } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');
const { VERSION_CONFIG } = require('./launcher');

const launcher = new Client();
const mcRoot = path.join(os.homedir(), "AppData", "Roaming", ".shampuneum");

function ensureDirectoryExists(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        
        https.get(url, response => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: ${url}`));
                return;
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                resolve();
            });
            
            file.on('error', error => {
                fs.unlink(filePath, () => {});
                reject(error);
            });
        }).on('error', reject);
    });
}

function installClient(username = 'Player', options = {}, sendLogToRenderer = console.log) {
    return new Promise((resolve, reject) => {
        const version = '1.21.8';
        const versionConfig = VERSION_CONFIG[version];

        if (!versionConfig) {
            sendLogToRenderer(`Неподдерживаемая версия: ${version}`, 'error');
            reject(new Error(`Неподдерживаемая версия: ${version}`));
            return;
        }

        sendLogToRenderer(`Начинается установка версии: ${version}`, 'info');
        ensureDirectoryExists(mcRoot);

        const installOptions = {
            authorization: {
                access_token: '0',
                client_token: '0',
                uuid: generateUUID(),
                name: username,
                user_type: 'legacy'
            },
            root: mcRoot,
            version: {
                number: versionConfig.number,
                type: versionConfig.type
            },
            memory: {
                max: options.maxMemory || '4G',
                min: options.minMemory || '2G'
            },
            forge: false,
            detached: false,
            javaPath: options.javaPath || undefined,
            installOnly: true,
            username: username
        };

        if (versionConfig.fabric) {
            installOptions.fabric = {
                version: versionConfig.fabric
            };
        }

        installMinecraftVersion(installOptions, sendLogToRenderer)
            .then(() => downloadAdditionalFiles(version, options, sendLogToRenderer))
            .then(() => createConfigFiles(version, options))
            .then(() => {
                sendLogToRenderer('Установка полностью завершена', 'success');
                resolve({
                    success: true,
                    version: version,
                    path: mcRoot,
                    message: 'Установка завершена успешно!'
                });
            })
            .catch(error => {
                sendLogToRenderer(`Ошибка установки: ${error.message}`, 'error');
                reject(error);
            });
    });
}

function installMinecraftVersion(options, sendLogToRenderer) {
    return new Promise((resolve, reject) => {
        const version = options.version.number;
        
        sendLogToRenderer(`Загрузка версии ${version}`, 'info');
        
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
                sendLogToRenderer(`Установка ${version} завершена`, 'success');
                resolve();
            })
            .catch(reject);
    });
}

function downloadVersionManifest(version) {
    return new Promise((resolve, reject) => {
        const versionDir = path.join(mcRoot, 'versions', version);
        ensureDirectoryExists(versionDir);
        
        const manifestUrl = `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`;
        
        https.get(manifestUrl, response => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                try {
                    const manifest = JSON.parse(data);
                    const versionInfo = manifest.versions.find(v => v.id === version);
                    
                    if (!versionInfo) {
                        reject(new Error(`Версия ${version} не найдена`));
                        return;
                    }
                    
                    https.get(versionInfo.url, versionResponse => {
                        let versionData = '';
                        versionResponse.on('data', chunk => versionData += chunk);
                        versionResponse.on('end', () => {
                            const versionJsonPath = path.join(versionDir, `${version}.json`);
                            fs.writeFileSync(versionJsonPath, versionData);
                            resolve();
                        });
                    }).on('error', reject);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

function downloadVersionJar(version) {
    return new Promise((resolve, reject) => {
        const versionDir = path.join(mcRoot, 'versions', version);
        const versionJsonPath = path.join(versionDir, `${version}.json`);
        const jarPath = path.join(versionDir, `${version}.jar`);
        
        if (fs.existsSync(jarPath)) {
            resolve();
            return;
        }
        
        try {
            const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
            const jarUrl = versionData.downloads.client.url;
            
            downloadFile(jarUrl, jarPath)
                .then(resolve)
                .catch(reject);
        } catch (error) {
            reject(error);
        }
    });
}

function downloadLibraries(version) {
    return new Promise((resolve, reject) => {
        const versionDir = path.join(mcRoot, 'versions', version);
        const versionJsonPath = path.join(versionDir, `${version}.json`);
        const librariesDir = path.join(mcRoot, 'libraries');
        
        try {
            const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
            const libraries = versionData.libraries || [];
            
            const downloadPromises = libraries.map(library => {
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
        const fabricVersionDir = path.join(mcRoot, 'versions', fabricVersionName);
        const fabricJsonPath = path.join(fabricVersionDir, `${fabricVersionName}.json`);
        const fabricJarPath = path.join(fabricVersionDir, `${fabricVersionName}.jar`);
        const originalJarPath = path.join(mcRoot, 'versions', version, `${version}.jar`);

        ensureDirectoryExists(fabricVersionDir);

        if (!fs.existsSync(originalJarPath)) {
            reject(new Error(`Оригинальный JAR Minecraft ${version} не найден`));
            return;
        }

        const metadataUrl = `https://meta.fabricmc.net/v2/versions/loader/${version}/${fabricVersion}/profile/json`;
        
        https.get(metadataUrl, response => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
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
        }).on('error', reject);
    });
}

function downloadFabricLibraries(fabricProfile) {
    return new Promise((resolve, reject) => {
        const librariesDir = path.join(mcRoot, 'libraries');
        const libraries = fabricProfile.libraries || [];
        
        const downloadPromises = libraries.map(library => {
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
    return new Promise((resolve) => {
        const promises = [
            downloadResourcePack(sendLogToRenderer),
            downloadMods(sendLogToRenderer)
        ];
        
        Promise.all(promises)
            .then(() => resolve())
            .catch(() => resolve()); // Не прерываем установку из-за дополнительных файлов
    });
}

function downloadResourcePack(sendLogToRenderer) {
    return new Promise((resolve) => {
        const resourcePacksDir = path.join(mcRoot, 'resourcepacks');
        ensureDirectoryExists(resourcePacksDir);

        const resourcePackPath = path.join(resourcePacksDir, 'Shampuneum.zip');
        const fileId = '17gwAudZ9rErh4v6jiGcHA-2xyJXeJL5I';
        const resourcePackUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
        
        sendLogToRenderer('Загрузка ресурспака...', 'info');

        downloadFileWithRedirects(resourcePackUrl, resourcePackPath)
            .then(() => {
                sendLogToRenderer('Ресурспак загружен', 'success');
                resolve();
            })
            .catch(() => {
                sendLogToRenderer('Ошибка загрузки ресурспака', 'error');
                resolve();
            });
    });
}

function downloadMods(sendLogToRenderer) {
    return new Promise((resolve) => {
        const modsDir = path.join(mcRoot, 'mods');
        ensureDirectoryExists(modsDir);

        // Добавьте здесь список модов для загрузки
        const mods = [
            // { fileId: 'YOUR_MOD_FILE_ID_1', fileName: 'mod1.jar' }
        ];

        if (mods.length === 0) {
            resolve();
            return;
        }

        sendLogToRenderer('Загрузка модов...', 'info');
        
        const downloadPromises = mods.map(mod => {
            const modPath = path.join(modsDir, mod.fileName);
            const modUrl = `https://drive.google.com/uc?export=download&id=${mod.fileId}&confirm=t`;
            
            return downloadFileWithRedirects(modUrl, modPath);
        });

        Promise.all(downloadPromises)
            .then(() => {
                sendLogToRenderer('Моды загружены', 'success');
                resolve();
            })
            .catch(() => {
                sendLogToRenderer('Ошибка загрузки модов', 'error');
                resolve();
            });
    });
}

function downloadFileWithRedirects(url, filePath, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
            reject(new Error('Превышено количество редиректов'));
            return;
        }

        const file = fs.createWriteStream(filePath);
        
        https.get(url, response => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                file.close();
                fs.unlink(filePath, () => {});
                downloadFileWithRedirects(response.headers.location, filePath, redirectCount + 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(filePath, () => {});
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                const stats = fs.statSync(filePath);
                if (stats.size < 1024) {
                    fs.unlinkSync(filePath);
                    reject(new Error('Файл слишком мал'));
                    return;
                }
                resolve();
            });

            file.on('error', error => {
                fs.unlink(filePath, () => {});
                reject(error);
            });
        }).on('error', error => {
            file.close();
            fs.unlink(filePath, () => {});
            reject(error);
        });
    });
}

function createConfigFiles(version, options = {}) {
    return new Promise((resolve) => {
        const configDir = path.join(mcRoot, 'config');
        ensureDirectoryExists(configDir);
        
        const optionsFile = path.join(mcRoot, 'options.txt');
        const defaultOptions = `version:3465
autoJump:false
enableVsync:true
fov:${options.fov || '90.0'}
renderDistance:${options.renderDistance || '12'}
maxFps:${options.maxFps || '120'}
resourcePacks:["vanilla","Shampuneum.zip"]
lang:${options.language || 'ru_ru'}
lastServer:${options.autoConnectServer ? 'shampuneum.net:25565' : ''}`;

        fs.writeFileSync(optionsFile, defaultOptions);
        
        const serversFile = path.join(mcRoot, 'servers.dat');
        fs.writeFileSync(serversFile, '');
        
        resolve();
    });
}

function verifyInstallation(version) {
    return new Promise((resolve) => {
        const versionDir = path.join(mcRoot, 'versions', version);
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
    createConfigFiles
};