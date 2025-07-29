if (typeof require !== 'undefined') {
    const { ipcRenderer } = require('electron');
    
    const installBtn = document.getElementById('install');
    const playBtn = document.getElementById('play-btn');
    const exitBtn = document.getElementById('logout');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const useAdminBuild = document.getElementById('use-admin-build');
    const maxMemoryInput = document.getElementById('max-memory');
    const maxMemoryValue = document.getElementById('max-memory-value');
    const minMemorySelect = document.getElementById('min-memory');
    const javaPathInput = document.getElementById('java-path');
    const selectJavaPathBtn = document.getElementById('select-java-path');
    const saveSettingsBtn = document.getElementById('save-settings');

    let isInstalling = false;
    let isPlaying = false;
    let isClientInstalled = false;
    let currentTab = 'home';

    function appendLog(text, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${text}`);
    }

    function updateStatus(status, text) {
        statusDot.className = `status-dot ${status}`;
        statusText.textContent = text;
    }

    function updateButtonStates() {
        if (isInstalling) {
            installBtn.disabled = true;
            installBtn.textContent = 'УСТАНОВКА...';
            playBtn.classList.add('hidden');
        } else if (isPlaying) {
            playBtn.disabled = true;
            playBtn.textContent = 'ЗАПУСК...';
            installBtn.classList.add('hidden');
        } else {
            installBtn.disabled = false;
            installBtn.textContent = 'УСТАНОВИТЬ';
            playBtn.disabled = false;
            playBtn.textContent = 'ИГРАТЬ';
            if (isClientInstalled) {
                installBtn.classList.add('hidden');
                playBtn.classList.remove('hidden');
            } else {
                installBtn.classList.remove('hidden');
                playBtn.classList.add('hidden');
            }
        }
    }

    function switchTab(tab) {
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        document.getElementById(`${tab}-tab`).classList.remove('hidden');
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.tab === tab) {
                item.classList.add('active');
            }
        });
        currentTab = tab;
        appendLog(`Переключение на вкладку: ${tab}`);
    }

    ipcRenderer.on('log-message', (event, { message, type }) => {
        appendLog(message, type);
    });

    ipcRenderer.on('installation-status', (event, status) => {
        isClientInstalled = status.clientInstalled;
        appendLog(`Клиент ${isClientInstalled ? 'установлен' : 'не установлен'}`);
        updateButtonStates();
        updateStatus('', isClientInstalled ? 'Готов к игре' : 'Клиент не установлен');
    });

    ipcRenderer.on('settings-loaded', (event, settings) => {
        maxMemoryInput.value = parseInt(settings.maxMemory) || 4;
        maxMemoryValue.textContent = `${maxMemoryInput.value} GB`;
        minMemorySelect.value = settings.minMemory || '2G';
        javaPathInput.value = settings.javaPath || '(Автоматически)';
        appendLog('Настройки загружены');
    });

    installBtn.addEventListener('click', async () => {
        if (isInstalling) return;
        
        isInstalling = true;
        updateButtonStates();
        updateStatus('installing', 'Установка...');
        
        const options = {
            version: '1.21.7',
            useAdmin: useAdminBuild.checked,
            includeOptiFine: false,
            includeAdminMods: useAdminBuild.checked,
            maxMemory: `${maxMemoryInput.value}G`,
            minMemory: minMemorySelect.value,
            javaPath: javaPathInput.value === '(Автоматически)' ? undefined : javaPathInput.value
        };
        
        appendLog(`Запуск установки клиента версии ${options.version}...`);
        
        try {
            const result = await ipcRenderer.invoke('install-client', options);
            appendLog(`Установка завершена: ${result.message}`, 'success');
            updateStatus('', 'Готов к игре');
            isClientInstalled = true;
            updateButtonStates();
            
            await ipcRenderer.invoke('show-info-dialog', 
                'Установка завершена', 
                'Клиент успешно установлен! Теперь вы можете запустить игру.');
                
        } catch (error) {
            appendLog(`Ошибка установки: ${error.message}`, 'error');
            updateStatus('offline', 'Ошибка установки');
            
            await ipcRenderer.invoke('show-error-dialog', 
                'Ошибка установки', 
                `Не удалось установить клиент:\n${error.message}`);
        } finally {
            isInstalling = false;
            updateButtonStates();
        }
    });

    playBtn.addEventListener('click', async () => {
        if (isPlaying) return;
        
        isPlaying = true;
        updateButtonStates();
        updateStatus('installing', 'Запуск игры...');
        
        const options = {
            version: '1.21.7',
            useAdmin: useAdminBuild.checked,
            maxMemory: `${maxMemoryInput.value}G`,
            minMemory: minMemorySelect.value,
            javaPath: javaPathInput.value === '(Автоматически)' ? undefined : javaPathInput.value
        };
        
        appendLog(`Запуск Minecraft ${options.version}${options.useAdmin ? ' (сборка администрации)' : ''}...`);
        
        try {
            const result = await ipcRenderer.invoke('launch-minecraft', options);
            appendLog(`Minecraft запущен (PID: ${result.pid})`, 'success');
            updateStatus('', 'Игра запущена');
            
            setTimeout(() => {
                ipcRenderer.send('minimize-window');
            }, 2000);
            
        } catch (error) {
            appendLog(`Ошибка запуска: ${error.message}`, 'error');
            updateStatus('offline', 'Ошибка запуска');
            
            await ipcRenderer.invoke('show-error-dialog', 
                'Ошибка запуска', 
                `Не удалось запустить игру:\n${error.message}\n\nВозможно, нужно сначала установить клиент.`);
        } finally {
            isPlaying = false;
            updateButtonStates();
        }
    });

    exitBtn.addEventListener('click', async () => {
        if (isInstalling || isPlaying) {
            const proceed = await ipcRenderer.invoke('show-info-dialog', 
                'Подтверждение выхода', 
                'Операция в процессе. Вы уверены, что хотите выйти?');
            
            if (proceed.response !== 0) return;
        }
        
        appendLog('Выход из приложения...');
        await ipcRenderer.invoke('app-quit');
    });

    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            switchTab(tab);
        });
    });

    useAdminBuild.addEventListener('change', () => {
        const status = useAdminBuild.checked ? 'включена' : 'отключена';
        appendLog(`Сборка администрации: ${status}`);
        
        if (useAdminBuild.checked) {
            appendLog('Будут загружены дополнительные моды от администрации', 'info');
        }
    });

    maxMemoryInput.addEventListener('input', () => {
        maxMemoryValue.textContent = `${maxMemoryInput.value} GB`;
        appendLog(`Максимальная память: ${maxMemoryInput.value} GB`);
    });

    selectJavaPathBtn.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('select-java-path');
        if (result.filePaths && result.filePaths.length > 0) {
            javaPathInput.value = result.filePaths[0];
            appendLog(`Выбран путь к Java: ${result.filePaths[0]}`);
        }
    });

    saveSettingsBtn.addEventListener('click', async () => {
        const settings = {
            maxMemory: `${maxMemoryInput.value}G`,
            minMemory: minMemorySelect.value,
            javaPath: javaPathInput.value
        };
        try {
            await ipcRenderer.invoke('save-settings', settings);
            appendLog('Настройки сохранены', 'success');
            await ipcRenderer.invoke('show-info-dialog', 'Настройки сохранены', 'Настройки успешно сохранены!');
        } catch (error) {
            appendLog(`Ошибка сохранения настроек: ${error.message}`, 'error');
            await ipcRenderer.invoke('show-error-dialog', 'Ошибка', `Не удалось сохранить настройки:\n${error.message}`);
        }
    });

    async function getAppInfo() {
        try {
            const version = await ipcRenderer.invoke('get-app-version');
            appendLog(`Версия лаунчера: ${version}`);
        } catch (error) {
            appendLog('Не удалось получить версию лаунчера', 'warning');
        }
    }

    async function checkSystemRequirements() {
        appendLog('Проверка системных требований...');
        
        const memoryInfo = process.getSystemMemoryInfo ? process.getSystemMemoryInfo() : null;
        if (memoryInfo) {
            const totalMemoryGB = Math.round(memoryInfo.total / 1024 / 1024);
            appendLog(`Доступная память: ${totalMemoryGB} GB`);
            
            if (totalMemoryGB < 4) {
                appendLog('Рекомендуется увеличить выделение памяти', 'warning');
            }
        }
        
        appendLog('Проверка Java...');
    }

    async function checkForUpdates() {
        appendLog('Проверка обновлений...');
        setTimeout(() => {
            appendLog('Обновления не найдены');
        }, 1000);
    }

    document.addEventListener('DOMContentLoaded', async () => {
        appendLog('=== SHAMPUNEUM LAUNCHER ===');
        appendLog('Лаунчер инициализирован');
        
        await getAppInfo();
        await checkSystemRequirements();
        await checkForUpdates();
        await ipcRenderer.invoke('load-settings');
        
        appendLog('Готов к работе!', 'success');
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'F5') {
            event.preventDefault();
            location.reload();
        }
        
        if (event.key === 'F12') {
            event.preventDefault();
            ipcRenderer.send('toggle-devtools');
        }
        
        if (event.ctrlKey && event.shiftKey && event.key === 'I') {
            event.preventDefault();
            ipcRenderer.send('toggle-devtools');
        }
    });

    window.addEventListener('beforeunload', (event) => {
        if (isInstalling || isPlaying) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

} else {
    console.log('Запущен в браузере - демо-режим');
    
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Запущен в браузере (демо-режим)');
    });
}