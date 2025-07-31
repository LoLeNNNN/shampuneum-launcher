    (function () {
      // Проверяем окружение
      const isElectron = typeof window !== 'undefined' && window.electronAPI;
      let electronAPI = null;

      if (isElectron) {
        electronAPI = window.electronAPI;
      }

      // Состояние приложения
      let isInstalling = false;
      let isPlaying = false;
      let isClientInstalled = false;
      let clientStatus = null;
      let currentTab = 'home';
      let logs = [];
      let updateAvailable = false;
      let isAuthenticated = false;
      let currentUser = null;
      let currentUpdateInfo = null;
      let isUpdating = false;

      const elements = {
        loginModal: document.getElementById('login-modal'),
        loginButton: document.getElementById('login-button'),
        usernameInput: document.getElementById('username'),
        passwordInput: document.getElementById('password'),

        launcher: document.getElementById('launcher'),
        usernameDisplay: document.getElementById('username-display'),
        userAccess: document.getElementById('user-access'),

        installBtn: document.getElementById('install'),
        playBtn: document.getElementById('play-btn'),
        checkStatusBtn: document.getElementById('check-status'),
        exitBtn: document.getElementById('logout'),

        statusDot: document.getElementById('status-dot'),
        statusText: document.getElementById('status-text'),
        statusContainer: document.getElementById('status-container'),

        maxMemoryInput: document.getElementById('max-memory'),
        maxMemoryValue: document.getElementById('max-memory-value'),
        minMemorySelect: document.getElementById('min-memory'),
        javaPathInput: document.getElementById('java-path'),
        selectJavaPathBtn: document.getElementById('select-java-path'),
        saveSettingsBtn: document.getElementById('save-settings'),

        menuItems: document.querySelectorAll('.menu-item'),
        tabContents: document.querySelectorAll('.tab-content'),
        toast: document.getElementById('toast'),
        logContainer: document.getElementById('log-container'),
        updateBadge: document.getElementById('update-badge'),
        versionSelect: document.getElementById('version-select')
      };

      function appendLog(text, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${text}`;
        console.log(logEntry);

        logs.push(logEntry);

        if (elements.logContainer) {
          elements.logContainer.textContent = logs.join('\n');
          elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
        }
      }

      function showToast(message, type = 'success') {
        if (!elements.toast) return;

        const messageEl = elements.toast.querySelector('.toast-message');
        if (messageEl) messageEl.textContent = message;

        elements.toast.className = `toast ${type} show`;

        setTimeout(() => {
          elements.toast.classList.remove('show');
        }, 3000);
      }
      function setupUpdateHandlers() {
        const updateModal = document.getElementById('update-modal');
        const updateNowBtn = document.getElementById('update-now-btn');
        const updateLaterBtn = document.getElementById('update-later-btn');
        const skipVersionBtn = document.getElementById('skip-version-btn');

        // Показать обновление
        if (window.electronAPI && window.electronAPI.onUpdateAvailable) {
          window.electronAPI.onUpdateAvailable((event, updateInfo) => {
            showUpdateModal(updateInfo);
          });
        }

        // Прогресс обновления
        if (window.electronAPI && window.electronAPI.onUpdateProgress) {
          window.electronAPI.onUpdateProgress((event, progress) => {
            updateDownloadProgress(progress);
          });
        }

        // Обновить сейчас
        // Обновить сейчас
        if (updateNowBtn) {
          updateNowBtn.addEventListener('click', handleUpdateDownload);
        }
        if (updateLaterBtn) {
          updateLaterBtn.addEventListener('click', () => {
            hideUpdateModal();
            showToast('Обновление отложено', 'info');
          });
        }

        // Пропустить версию
        if (skipVersionBtn) {
          skipVersionBtn.addEventListener('click', async () => {
            if (!currentUpdateInfo) return;

            try {
              await window.electronAPI.skipUpdateVersion(currentUpdateInfo.version);
              hideUpdateModal();
              showToast(`Версия ${currentUpdateInfo.version} пропущена`, 'info');
            } catch (error) {
              showToast('Ошибка при пропуске версии', 'error');
            }
          });
        }
      }

      function showUpdateModal(updateInfo) {
        currentUpdateInfo = updateInfo;

        // Заполняем информацию
        const versionText = document.getElementById('update-version-text');
        const sizeText = document.getElementById('update-size-text');
        const dateText = document.getElementById('update-date-text');
        const typeText = document.getElementById('update-type-text');
        const changelog = document.getElementById('update-changelog');

        if (versionText) versionText.textContent = updateInfo.version;
        if (sizeText) sizeText.textContent = updateInfo.size;
        if (dateText) dateText.textContent = updateInfo.publishDate;
        if (typeText) typeText.textContent = updateInfo.isPortable ? 'Портативная версия' : 'Установщик';
        if (changelog) changelog.textContent = updateInfo.changelog;

        // Показываем модальное окно
        const modal = document.getElementById('update-modal');
        if (modal) {
          modal.style.display = 'flex';

          // Добавляем анимацию появления
          setTimeout(() => {
            modal.classList.add('show');
          }, 10);
        }

        appendLog(`Доступно обновление до версии ${updateInfo.version}`, 'info');
      }

      function hideUpdateModal() {
        const modal = document.getElementById('update-modal');
        if (modal) {
          modal.classList.remove('show');
          setTimeout(() => {
            modal.style.display = 'none';
          }, 300);
        }
        currentUpdateInfo = null;
      }

      function showUpdateProgress() {
        const progressSection = document.getElementById('update-progress-section');
        const buttons = document.querySelector('.modal-buttons');

        if (progressSection) progressSection.style.display = 'block';
        if (buttons) buttons.style.display = 'none';
      }

      function updateDownloadProgress(progress) {
        const progressFill = document.getElementById('update-progress-fill');
        const progressText = document.getElementById('progress-percentage');

        if (progressFill) {
          progressFill.style.width = progress + '%';
        }
        if (progressText) {
          progressText.textContent = progress + '%';
        }
      }
      async function handleUpdateDownload() {
        if (!currentUpdateInfo || isUpdating) return;

        isUpdating = true;
        showUpdateProgress();

        const updateNowBtn = document.getElementById('update-now-btn');
        if (updateNowBtn) {
          updateNowBtn.disabled = true;
          updateNowBtn.innerHTML = '<span class="btn-icon">⏳</span> Загрузка...';
        }

        try {
          appendLog(`Начинается загрузка обновления ${currentUpdateInfo.version}`, 'info');

          // Устанавливаем обработчик прогресса
          let progressTimeout;
          let lastProgressUpdate = Date.now();

          window.electronAPI.onUpdateProgress((event, progress) => {
            updateDownloadProgress(progress);
            lastProgressUpdate = Date.now();

            // Таймаут для обнаружения зависания
            clearTimeout(progressTimeout);
            progressTimeout = setTimeout(() => {
              const timeSinceLastUpdate = Date.now() - lastProgressUpdate;
              if (timeSinceLastUpdate > 30000 && progress < 100) { // 30 секунд без обновления
                appendLog(`Возможное зависание на ${progress}%. Попробуйте позже.`, 'warning');
              }
            }, 30000);
          });

          const result = await window.electronAPI.downloadUpdate(
            currentUpdateInfo.downloadUrl,
            currentUpdateInfo.fileName
          );

          clearTimeout(progressTimeout);

          if (result.success) {
            appendLog('Обновление успешно установлено!', 'success');
            showToast('Обновление установлено! Лаунчер будет перезапущен', 'success');

            // Показываем сообщение об успешном обновлении
            const progressSection = document.getElementById('update-progress-section');
            if (progressSection) {
              progressSection.innerHTML = `
          <div class="update-success">
            <div class="success-icon">✅</div>
            <div class="success-message">Обновление установлено успешно!</div>
            <div class="success-note">Лаунчер будет перезапущен автоматически</div>
          </div>
        `;
            }

          } else {
            throw new Error(result.error || 'Неизвестная ошибка загрузки');
          }
        } catch (error) {
          appendLog(`Ошибка загрузки обновления: ${error.message}`, 'error');
          showToast(`Ошибка обновления: ${error.message}`, 'error');

          // Восстанавливаем кнопку
          if (updateNowBtn) {
            updateNowBtn.disabled = false;
            updateNowBtn.innerHTML = '<span class="btn-icon">⬇️</span> Обновить сейчас';
          }

          // Скрываем прогресс и показываем кнопки
          const progressSection = document.getElementById('update-progress-section');
          const buttons = document.querySelector('.modal-buttons');
          if (progressSection) progressSection.style.display = 'none';
          if (buttons) buttons.style.display = 'flex';

        } finally {
          isUpdating = false;
        }
      }
      async function getSystemInfo() {
        if (!isElectron || !electronAPI) return null;

        try {
          const os = require('os');
          const totalMemoryGB = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
          const recommendedMemory = Math.max(2, Math.floor(totalMemoryGB * 0.5)); // 50% от общей памяти, минимум 2GB
          const maxRecommended = Math.min(16, Math.floor(totalMemoryGB * 0.8)); // Максимум 80% от общей памяти

          return {
            totalMemory: totalMemoryGB,
            recommendedMemory,
            maxRecommended
          };
        } catch (error) {
          appendLog(`Ошибка получения информации о системе: ${error.message}`, 'error');
          return {
            totalMemory: 8,
            recommendedMemory: 4,
            maxRecommended: 8
          };
        }
      }
      // Ручная проверка обновлений
      async function checkForUpdatesManually() {
        if (!window.electronAPI) {
          showToast('Функция доступна только в приложении', 'error');
          return;
        }

        try {
          appendLog('Проверка обновлений...', 'info');
          const result = await window.electronAPI.checkUpdates();

          if (result.available) {
            showUpdateModal(result);
          } else {
            showToast('У вас установлена последняя версия', 'success');
            appendLog('Обновлений не найдено', 'info');
          }
        } catch (error) {
          showToast(`Ошибка проверки обновлений: ${error.message}`, 'error');
          appendLog(`Ошибка проверки обновлений: ${error.message}`, 'error');
        }
      }
      function updateStatus(status, text) {
        if (elements.statusDot) {
          elements.statusDot.className = `status-dot ${status}`;
        }
        if (elements.statusText) {
          elements.statusText.textContent = text;
        }
        if (elements.statusContainer) {
          elements.statusContainer.className = 'status';
          if (status === 'installing') {
            elements.statusContainer.classList.add('installing');
          } else if (status === 'offline') {
            elements.statusContainer.classList.add('offline');
          }
        }
      }

      function updateButtonStates() {
        if (elements.installBtn) elements.installBtn.classList.add('hidden');
        if (elements.playBtn) elements.playBtn.classList.add('hidden');
        if (elements.checkStatusBtn) elements.checkStatusBtn.classList.add('hidden');

        if (isInstalling) {
          if (elements.installBtn) {
            elements.installBtn.disabled = true;
            elements.installBtn.textContent = 'УСТАНОВКА...';
            elements.installBtn.classList.remove('hidden');
          }
          updateStatus('installing', 'Установка...');
        } else if (isPlaying) {
          if (elements.playBtn) {
            elements.playBtn.disabled = true;
            elements.playBtn.textContent = 'ЗАПУСК...';
            elements.playBtn.classList.remove('hidden');
          }
          updateStatus('installing', 'Запуск игры...');
        } else {
          if (elements.installBtn) {
            elements.installBtn.disabled = false;
            elements.installBtn.textContent = 'УСТАНОВИТЬ';
          }
          if (elements.playBtn) {
            elements.playBtn.disabled = false;
            elements.playBtn.textContent = 'ИГРАТЬ';
          }

          if (isClientInstalled) {
            if (elements.playBtn) elements.playBtn.classList.remove('hidden');
            if (elements.checkStatusBtn) elements.checkStatusBtn.classList.remove('hidden');
            updateStatus('', 'Готов к игре');
          } else {
            if (elements.installBtn) elements.installBtn.classList.remove('hidden');
            if (elements.checkStatusBtn) elements.checkStatusBtn.classList.remove('hidden');
            updateStatus('offline', 'Клиент не установлен');
          }
        }
      }

      async function checkClientStatus() {
        if (!isElectron || !electronAPI) {
          appendLog('Проверка статуса доступна только в приложении', 'warning');
          return;
        }

        appendLog('Проверка статуса клиента...', 'info');

        try {
          const status = await electronAPI.checkGameStatus();
          clientStatus = status;
          isClientInstalled = status.clientInstalled;

          appendLog(`Статус клиента: ${isClientInstalled ? 'установлен' : 'не установлен'}`, 'info');

          if (status.details) {
            appendLog(`Подробности: Vanilla=${status.details.vanilla}, Fabric=${status.details.fabric}`, 'info');
          }

          if (status.error) {
            appendLog(`Ошибка проверки: ${status.error}`, 'error');
          }

          updateButtonStates();

        } catch (error) {
          appendLog(`Ошибка проверки статуса: ${error.message}`, 'error');
          isClientInstalled = false;
          updateButtonStates();
        }
      }

      function switchTab(tab) {
        elements.tabContents.forEach(content => {
          content.classList.remove('active');
        });

        const tabContent = document.getElementById(`${tab}-tab`);
        if (tabContent) tabContent.classList.add('active');

        elements.menuItems.forEach(item => {
          item.classList.remove('active');
          if (item.dataset.tab === tab) {
            item.classList.add('active');
          }
        });
      }

      async function checkAuth() {
        try {
          if (isElectron && electronAPI) {
            const user = await electronAPI.getCurrentUser();
            if (user) {
              setAuthenticatedUser(user);
              return true;
            }
          }
        } catch (error) {
          appendLog('Ошибка проверки авторизации: ' + error.message, 'error');
        }
        return false;
      }

      function setAuthenticatedUser(user) {
        isAuthenticated = true;
        currentUser = user;

        if (elements.loginModal) elements.loginModal.style.display = 'none';
        if (elements.launcher) elements.launcher.style.display = 'flex';

        if (elements.usernameDisplay) {
          elements.usernameDisplay.textContent = user.username || 'Пользователь';
        }
        if (elements.userAccess) {
          elements.userAccess.textContent = `Проходка: ${user.access || 'навсегда'}`;
        }

        appendLog(`Пользователь ${user.username} авторизован`, 'success');

        setTimeout(() => {
          checkClientStatus();
        }, 500);
      }

      async function handleLogin() {
        const username = elements.usernameInput?.value?.trim();
        const password = elements.passwordInput?.value?.trim();

        if (!username || !password) {
          showToast('Введите логин и пароль', 'error');
          return;
        }

        if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
          showToast('Ник должен содержать 3-16 символов (a-z, 0-9, _)', 'error');
          return;
        }

        try {
          let authResult;

          if (isElectron && electronAPI) {
            authResult = await electronAPI.sendAuthRequest({ username, password });
          } else {
            const response = await fetch('http://95.79.192.194:3000/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password })
            });
            authResult = await response.json();
          }

          if (authResult.success) {
            showToast('Авторизация успешна', 'success');
            setAuthenticatedUser({
              username: authResult.username,
              access: authResult.access
            });
          } else {
            showToast(authResult.message || 'Ошибка авторизации', 'error');
          }
        } catch (error) {
          appendLog('Ошибка авторизации: ' + error.message, 'error');
          showToast('Ошибка соединения', 'error');
        }
      }

      async function handleInstall() {
        if (isInstalling || !isAuthenticated) return;

        isInstalling = true;
        updateButtonStates();

        const options = {
          version: '1.21.8',
          maxMemory: elements.maxMemoryInput ? `${elements.maxMemoryInput.value}G` : '4G',
          minMemory: elements.minMemorySelect ? elements.minMemorySelect.value : '2G',
          javaPath: elements.javaPathInput?.value === '(Автоматически)' ? undefined : elements.javaPathInput?.value,
          modpack: elements.versionSelect ? elements.versionSelect.value : 'ULTRA'
        };

        appendLog(`Запуск установки клиента версии ${options.version} с модпаком ${options.modpack}...`);

        try {
          if (!isElectron || !electronAPI) {
            throw new Error('Функция доступна только в приложении');
          }

          const result = await electronAPI.installClient(options);
          appendLog(`Установка завершена: ${result.message || 'Успешно'}`, 'success');

          await checkClientStatus();

          showToast('Клиент успешно установлен!', 'success');

        } catch (error) {
          appendLog(`Ошибка установки: ${error.message}`, 'error');
          showToast(`Ошибка установки: ${error.message}`, 'error');
        } finally {
          isInstalling = false;
          updateButtonStates();
        }
      }

      async function handlePlay() {
        if (isPlaying || !isAuthenticated) return;

        if (!isClientInstalled) {
          showToast('Сначала установите клиент', 'error');
          return;
        }

        isPlaying = true;
        updateButtonStates();

        const version = elements.versionSelect ? elements.versionSelect.value.split('-')[0] : '1.21.8';
        const options = {
          version: version,
          useAdmin: false,
          maxMemory: elements.maxMemoryInput ? `${elements.maxMemoryInput.value}G` : '4G',
          minMemory: elements.minMemorySelect ? elements.minMemorySelect.value : '2G',
          javaPath: elements.javaPathInput?.value === '(Автоматически)' ? undefined : elements.javaPathInput?.value,
          modpack: elements.versionSelect ? elements.versionSelect.value : 'ULTRA' // Передаем модпак
        };

        appendLog(`Запуск Minecraft ${options.version} для игрока ${currentUser?.username} с модпаком ${options.modpack}...`);

        try {
          if (!isElectron || !electronAPI) {
            throw new Error('Функция доступна только в приложении');
          }

          const result = await electronAPI.launchMinecraft(options);
          appendLog(`Minecraft запущен (PID: ${result.pid}) для игрока ${result.username}`, 'success');
          showToast('Minecraft запущен!', 'success');

          setTimeout(() => {
            isPlaying = false;
            updateButtonStates();
          }, 5000);

        } catch (error) {
          appendLog(`Ошибка запуска: ${error.message}`, 'error');
          showToast(`Ошибка запуска: ${error.message}`, 'error');
          isPlaying = false;
          updateButtonStates();
        }
      }

      async function loadSettings() {
        if (!isElectron || !electronAPI) return;

        try {
          const settings = await electronAPI.loadSettings();

          if (settings) {
            if (elements.maxMemoryInput) {
              const memValue = parseInt(settings.maxMemory) || 4;
              elements.maxMemoryInput.value = memValue;
              if (elements.maxMemoryValue) {
                elements.maxMemoryValue.textContent = `${memValue} GB`;
              }
            }
            if (elements.minMemorySelect) {
              elements.minMemorySelect.value = settings.minMemory || '2G';
            }
            if (elements.javaPathInput) {
              elements.javaPathInput.value = settings.javaPath || '(Автоматически)';
            }
            if (elements.versionSelect && settings.modpack) {
              elements.versionSelect.value = settings.modpack;
              appendLog(`Загружен модпак: ${settings.modpack}`, 'info');
            }
            appendLog('Настройки загружены', 'success');
          }
        } catch (error) {
          appendLog('Ошибка загрузки настроек: ' + error.message, 'error');
        }
      }

      async function saveSettings() {
        if (!isElectron || !electronAPI) return;

        const settings = {
          maxMemory: elements.maxMemoryInput ? `${elements.maxMemoryInput.value}G` : '4G',
          minMemory: elements.minMemorySelect ? elements.minMemorySelect.value : '2G',
          javaPath: elements.javaPathInput ? elements.javaPathInput.value : '(Автоматически)',
          modpack: elements.versionSelect ? elements.versionSelect.value : 'ULTRA'
        };

        try {
          await electronAPI.saveSettings(settings);
          appendLog('Настройки сохранены', 'success');
          showToast('Настройки успешно сохранены!');
        } catch (error) {
          appendLog(`Ошибка сохранения настроек: ${error.message}`, 'error');
          showToast(`Ошибка сохранения: ${error.message}`, 'error');
        }
      }

      async function getAppInfo() {
        if (!isElectron || !electronAPI) return;

        try {
          const version = await electronAPI.getAppVersion();
          appendLog(`Версия лаунчера: ${version}`);
          const versionElement = document.querySelector('.version-info');
          if (versionElement) {
            versionElement.textContent = `Лаунчер v${version}`;
          }
        } catch (error) {
          appendLog('Не удалось получить версию лаунчера', 'warning');
        }
      }

      function setupJavaPathHandler() {
        if (elements.selectJavaPathBtn) {
          elements.selectJavaPathBtn.addEventListener('click', async () => {
            if (!isElectron || !electronAPI) {
              showToast('Функция доступна только в приложении', 'error');
              return;
            }

            try {
              const result = await electronAPI.selectJavaPath();
              if (result.filePaths && result.filePaths.length > 0 && elements.javaPathInput) {
                elements.javaPathInput.value = result.filePaths[0];
                appendLog(`Выбран путь к Java: ${result.filePaths[0]}`);
              }
            } catch (error) {
              appendLog(`Ошибка выбора Java: ${error.message}`, 'error');
            }
          });
        }
      }

      function setupExitHandler() {
        if (elements.exitBtn) {
          elements.exitBtn.addEventListener('click', async () => {
            if (isInstalling || isPlaying) {
              const shouldExit = confirm('Операция в процессе. Вы уверены, что хотите выйти?');
              if (!shouldExit) return;
            }

            appendLog('Выход из приложения...');
            if (isElectron && electronAPI) {
              await electronAPI.quitApp();
            } else {
              window.close();
            }
          });
        }
      }

      function setupEventListeners() {
        if (elements.loginButton) {
          elements.loginButton.addEventListener('click', handleLogin);
        }

        if (elements.installBtn) {
          elements.installBtn.addEventListener('click', handleInstall);
        }

        if (elements.playBtn) {
          elements.playBtn.addEventListener('click', handlePlay);
        }

        if (elements.checkStatusBtn) {
          elements.checkStatusBtn.addEventListener('click', checkClientStatus);
        }

        setupJavaPathHandler();
        setupExitHandler();

        elements.menuItems.forEach(item => {
          item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            if (tab) switchTab(tab);
          });
        });

        if (elements.maxMemoryInput) {
          elements.maxMemoryInput.addEventListener('input', () => {
            const value = parseInt(elements.maxMemoryInput.value);
            if (elements.maxMemoryValue) {
              elements.maxMemoryValue.textContent = `${value} GB`;
            }
            appendLog(`Максимальная память: ${value} GB`);
          });
        }

        if (elements.saveSettingsBtn) {
          elements.saveSettingsBtn.addEventListener('click', saveSettings);
        }

        document.addEventListener('keydown', (event) => {
          if (event.key === 'F5') {
            event.preventDefault();
            if (isAuthenticated) {
              checkClientStatus();
              showToast('Статус обновлен', 'info');
            }
          }

          if (event.key === 'Enter' && elements.loginModal.style.display !== 'none') {
            handleLogin();
          }
        });

        window.addEventListener('beforeunload', (event) => {
          if (isInstalling || isPlaying) {
            event.preventDefault();
            event.returnValue = '';
          }
        });
      }

      function setupIpcListeners() {
        if (!isElectron || !electronAPI) return;

        if (window.electronAPI && window.electronAPI.onLogMessage) {
          window.electronAPI.onLogMessage((message, type) => {
            appendLog(message, type);
          });
        }

        if (window.electronAPI && window.electronAPI.onInstallationStatus) {
          window.electronAPI.onInstallationStatus((status) => {
            clientStatus = status;
            isClientInstalled = status.clientInstalled;
            appendLog(`Статус обновлен: ${isClientInstalled ? 'установлен' : 'не установлен'}`);
            updateButtonStates();
          });
        }
      }

      async function initialize() {
        appendLog('=== SHAMPUNEUM LAUNCHER ===');
        appendLog(`Запущен в режиме: ${isElectron ? 'Electron приложение' : 'Браузер (демо)'}`);

        if (isElectron) {
          await getAppInfo();
          await loadSettings();
          setupIpcListeners();
        } else {
          appendLog('Некоторые функции недоступны в браузере', 'warning');
        }

        const isAuth = await checkAuth();
        if (!isAuth) {
          if (elements.loginModal) elements.loginModal.style.display = 'flex';
          if (elements.launcher) elements.launcher.style.display = 'none';
          updateStatus('offline', 'Не авторизован');
        } else {
          setTimeout(() => {
            checkClientStatus();
          }, 1000);
        }

        appendLog('Готов к работе!', 'success');
      }

      document.addEventListener('DOMContentLoaded', async () => {
        setupEventListeners();
        setupUpdateHandlers();
        setTimeout(async () => {
          const loader = document.querySelector('.loader');
          if (loader) loader.style.display = 'none';

          if (!isElectron) {
            appendLog('Запущен в браузере - демо-режим');
          }

          await initialize();
        }, 1500);
      });
      if (typeof window !== 'undefined') {
        window.launcherAPI = {
          showToast,
          appendLog,
          checkClientStatus,
          isAuthenticated: () => isAuthenticated,
          getCurrentUser: () => currentUser,
          getClientStatus: () => clientStatus
        };
      }
    })();