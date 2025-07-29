const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Авторизация
  sendAuthRequest: (credentials) => ipcRenderer.invoke('auth-request', credentials),
  getCurrentUser: () => ipcRenderer.invoke('get-current-user'),

  // Управление клиентом
  installClient: (options) => ipcRenderer.invoke('install-client', options),
  launchMinecraft: (options) => ipcRenderer.invoke('launch-minecraft', options),
  checkGameStatus: () => ipcRenderer.invoke('check-game-status'),

  // Настройки
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  selectJavaPath: () => ipcRenderer.invoke('select-java-path'),

  // Приложение
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  quitApp: () => ipcRenderer.invoke('app-quit'),
  showErrorDialog: (title, content) => ipcRenderer.invoke('show-error-dialog', title, content),
  showInfoDialog: (title, content) => ipcRenderer.invoke('show-info-dialog', title, content),

  // События от main процесса
  onLogMessage: (callback) => {
    ipcRenderer.on('log-message', (event, { message, type }) => callback(message, type));
  },
  onInstallationStatus: (callback) => {
    ipcRenderer.on('installation-status', (event, status) => callback(status));
  },
  onInstallationProgress: (callback) => {
    ipcRenderer.on('installation-progress', (event, progress) => callback(progress));
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event) => callback());
  },
    // Методы для обновлений
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  downloadUpdate: (downloadUrl, fileName) => ipcRenderer.invoke('download-update', downloadUrl, fileName),
  skipUpdateVersion: (version) => ipcRenderer.invoke('skip-update-version', version),
  
  // События обновлений
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', callback),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', callback)
});