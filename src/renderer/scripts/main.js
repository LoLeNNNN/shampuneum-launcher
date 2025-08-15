import { state, elements } from './state.js';
import { appendLog, showToast, updateStatus } from './logs.js';
import { checkAuth, handleLogin, handleLogout, clearSavedAccount } from './auth.js';
import { handleInstall, handlePlay, checkClientStatus } from './client.js';
import { setupUpdateHandlers, checkForUpdatesManually } from './update.js';
import { getAppInfo, loadSettings, setupMemorySliders, setupJavaPathHandler, saveSettings, resetSettings } from './settings.js';
import { setupSkinUpload, applySkinPreview, resetSkinPreview } from './profile.js';
import { switchTab, setupTabHandlers } from './tabs.js';
import { updateMemoryPercentage } from './utils.js';

// Настройка обработчиков событий
function setupEventListeners() {
    // Основные кнопки
    elements.loginButton?.addEventListener("click", handleLogin);
    elements.installBtn?.addEventListener("click", handleInstall);
    elements.playBtn?.addEventListener("click", handlePlay);
    elements.checkStatusBtn?.addEventListener("click", checkClientStatus);
    elements.resetBtn?.addEventListener("click", resetSettings);
    elements.saveSettingsBtn?.addEventListener("click", saveSettings);
    
    // Выход из приложения
    elements.exitBtn?.addEventListener("click", async () => {
        if (state.isInstalling || state.isPlaying) {
            const shouldExit = confirm("Операция в процессе. Вы уверены, что хотите выйти?");
            if (!shouldExit) return;
        }
        
        appendLog("Выход из приложения...");
        if (state.isElectron && state.electronAPI) {
            await state.electronAPI.quitApp();
        } else {
            window.close();
        }
    });
    
    // Очистка сохраненного аккаунта
    const clearSavedBtn = document.getElementById("clear-saved-btn");
    if (clearSavedBtn) {
        clearSavedBtn.addEventListener("click", clearSavedAccount);
    }
    
    // Проверка обновлений
    if (elements.checkUpdatesBtn) {
        elements.checkUpdatesBtn.addEventListener("click", checkForUpdatesManually);
    }
    
    // Память
    if (elements.maxMemoryInput) {
        elements.maxMemoryInput.addEventListener("input", updateMemoryPercentage);
    }
    
    // Чекбоксы
    const checkboxes = [
        "high-priority", 
        "gc-optimization", 
        "auto-updates", 
        "close-launcher"
    ];
    
    checkboxes.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener("change", () => {
                const label = checkbox.nextElementSibling?.textContent || id;
                appendLog(`${label}: ${checkbox.checked ? "включено" : "отключено"}`);
            });
        }
    });
    
    // Глобальные обработчики
    document.addEventListener("keydown", (event) => {
        if (event.key === "F5") {
            event.preventDefault();
            if (state.isAuthenticated) {
                checkClientStatus();
                showToast("Статус обновлен", "info");
            }
        }
        
        if (event.key === "Enter" && elements.loginModal.style.display !== "none") {
            handleLogin();
        }
    });
    
    window.addEventListener("beforeunload", (event) => {
        if (state.isInstalling || state.isPlaying) {
            event.preventDefault();
            event.returnValue = "";
        }
    });
    
    // Специфические модули
    setupJavaPathHandler();
    setupMemorySliders();
    setupTabHandlers();
    setupSkinUpload();
    
    // Кнопки скинов
    const applySkinBtn = document.getElementById("apply-skin");
    const resetSkinBtn = document.getElementById("reset-skin");
    
    if (applySkinBtn) applySkinBtn.addEventListener("click", applySkinPreview);
    if (resetSkinBtn) resetSkinBtn.addEventListener("click", resetSkinPreview);
}

// Настройка IPC слушателей (Electron)
function setupIpcListeners() {
    if (!state.isElectron || !state.electronAPI) return;
    
    if (window.electronAPI.onLogMessage) {
        window.electronAPI.onLogMessage((message, type) => {
            appendLog(message, type);
        });
    }
    
    if (window.electronAPI.onInstallationStatus) {
        window.electronAPI.onInstallationStatus((status) => {
            state.clientStatus = status;
            state.isClientInstalled = status.clientInstalled;
            appendLog(`Статус обновлен: ${state.isClientInstalled ? "установлен" : "не установлен"}`);
            updateButtonStates();
        });
    }
}

// Инициализация настроек
async function initializeSettings() {
    await loadSettings();
    updateMemoryPercentage();
    appendLog("Настройки инициализированы", "success");
}

// Основная инициализация
async function initialize() {
    appendLog("=== SHAMPUNEUM LAUNCHER ===");
    appendLog(`Запущен в режиме: ${state.isElectron ? "Electron приложение" : "Браузер (демо)"}`);
    
    if (state.isElectron) {
        await getAppInfo();
        await initializeSettings();
        setupIpcListeners();
    } else {
        appendLog("Некоторые функции недоступны в браузере", "warning");
    }
    
    const isAuth = await checkAuth();
    if (!isAuth) {
        if (elements.loginModal) elements.loginModal.style.display = "flex";
        if (elements.launcher) elements.launcher.style.display = "none";
        updateStatus("offline", "Не авторизован");
    } else {
        setTimeout(() => {
            checkClientStatus();
        }, 1000);
    }
    
    appendLog("Готов к работе!", "success");
}

// Точка входа при загрузке DOM
document.addEventListener("DOMContentLoaded", async () => {
    // Скрыть лоадер
    setTimeout(() => {
        const loader = document.querySelector(".loader");
        if (loader) loader.style.display = "none";
    }, 1500);
    
    setupEventListeners();
    setupUpdateHandlers();
    await initialize();
    
    // Экспорт API для глобального доступа
    window.launcherAPI = {
        showToast,
        appendLog,
        checkClientStatus,
        isAuthenticated: () => state.isAuthenticated,
        getCurrentUser: () => state.currentUser,
        getClientStatus: () => state.clientStatus
    };
});
/*
чё перенёс в функции(чтобы нее забыть)
state.js (Глобальное состояние и DOM-элементы)
utils.js (Вспомогательные функции)
logs.js (Логирование и UI-уведомления)
auth.js (Авторизация и работа с аккаунтом)
profile.js (Профиль пользователя и скины)
settings.js (Настройки лаунчера)
client.js (Установка, запуск игры и прочие штуки связанные с клиентом игры)
update.js (Обновления лаунчера)
tabs.js (Управление вкладками)
main.js (Главный модуль)
*/