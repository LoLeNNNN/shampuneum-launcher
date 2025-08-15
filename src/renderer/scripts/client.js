import { state, elements } from './state.js';
import { appendLog, showToast, updateButtonStates } from './logs.js';
import { normalizeMemoryValue } from './utils.js';

// Проверить статус клиента
export async function checkClientStatus() {
    if (!state.isElectron || !state.electronAPI) {
        appendLog("Проверка статуса доступна только в приложении", "warning");
        return;
    }
    
    appendLog("Проверка статуса клиента...", "info");
    
    try {
        const status = await state.electronAPI.checkGameStatus();
        state.clientStatus = status;
        state.isClientInstalled = status.clientInstalled;
        
        appendLog(`Статус клиента: ${state.isClientInstalled ? "установлен" : "не установлен"}`, "info");
        
        if (status.details) {
            appendLog(`Подробности: Vanilla=${status.details.vanilla}, Fabric=${status.details.fabric}`, "info");
        }
        
        if (status.error) {
            appendLog(`Ошибка проверки: ${status.error}`, "error");
        }
        
        updateButtonStates();
    } catch (error) {
        appendLog(`Ошибка проверки статуса: ${error.message}`, "error");
        state.isClientInstalled = false;
        updateButtonStates();
    }
}

// Установка клиента
export async function handleInstall() {
    if (state.isInstalling || !state.isAuthenticated) return;
    
    state.isInstalling = true;
    updateButtonStates();
    
    const highPriority = document.getElementById("high-priority")?.checked || false;
    const gcOptimization = document.getElementById("gc-optimization")?.checked || true;
    
    const options = {
        version: "1.21.8",
        maxMemory: normalizeMemoryValue(elements.maxMemoryInput?.value, "4G"),
        minMemory: normalizeMemoryValue(elements.minMemorySelect?.value, "2G"),
        javaPath: elements.javaPathInput?.value === "(Автоматически)" 
            ? undefined 
            : elements.javaPathInput?.value,
        modpack: elements.versionSelect ? elements.versionSelect.value : "ULTRA",
        highPriority,
        gcOptimization
    };
    
    appendLog(`Запуск установки клиента версии ${options.version} с модпаком ${options.modpack}...`);
    appendLog(`Настройки: Память ${options.minMemory}-${options.maxMemory}, GC оптимизация: ${gcOptimization ? "да" : "нет"}`);
    
    try {
        if (!state.isElectron || !state.electronAPI) {
            throw new Error("Функция доступна только в приложении");
        }
        
        const result = await state.electronAPI.installClient(options);
        appendLog(`Установка завершена: ${result.message || "Успешно"}`, "success");
        
        await checkClientStatus();
        showToast("Клиент успешно установлен!", "success");
    } catch (error) {
        appendLog(`Ошибка установки: ${error.message}`, "error");
        showToast(`Ошибка установки: ${error.message}`, "error");
    } finally {
        state.isInstalling = false;
        updateButtonStates();
    }
}

// Запуск игры
export async function handlePlay() {
    if (state.isPlaying || !state.isAuthenticated) return;
    
    if (!state.isClientInstalled) {
        showToast("Сначала установите клиент", "error");
        return;
    }
    
    state.isPlaying = true;
    updateButtonStates();
    
    const highPriority = document.getElementById("high-priority")?.checked || false;
    const gcOptimization = document.getElementById("gc-optimization")?.checked || true;
    const closeLauncher = document.getElementById("close-launcher")?.checked || false;
    
    const version = elements.versionSelect 
        ? elements.versionSelect.value.split("-")[0] 
        : "1.21.8";
    
    const options = {
        version: version,
        useAdmin: false,
        maxMemory: normalizeMemoryValue(elements.maxMemoryInput?.value, "4G"),
        minMemory: normalizeMemoryValue(elements.minMemorySelect?.value, "2G"),
        javaPath: elements.javaPathInput?.value === "(Автоматически)" 
            ? undefined 
            : elements.javaPathInput?.value,
        modpack: elements.versionSelect ? elements.versionSelect.value : "ULTRA",
        highPriority,
        gcOptimization,
        closeLauncher
    };
    
    appendLog(`Запуск Minecraft ${options.version} для игрока ${state.currentUser?.username}`);
    appendLog(`Настройки производительности: Приоритет ${highPriority ? "высокий" : "обычный"}, GC оптимизация: ${gcOptimization ? "да" : "нет"}`);
    
    try {
        if (!state.isElectron || !state.electronAPI) {
            throw new Error("Функция доступна только в приложении");
        }
        
        const result = await state.electronAPI.launchMinecraft(options);
        appendLog(`Minecraft запущен (PID: ${result.pid}) для игрока ${result.username}`, "success");
        showToast("Minecraft запущен!", "success");
        
        if (closeLauncher) {
            appendLog("Закрытие лаунчера по настройкам пользователя...");
            setTimeout(async () => {
                if (state.isElectron && state.electronAPI) {
                    await state.electronAPI.quitApp();
                }
            }, 3000);
        } else {
            setTimeout(() => {
                state.isPlaying = false;
                updateButtonStates();
            }, 5000);
        }
    } catch (error) {
        appendLog(`Ошибка запуска: ${error.message}`, "error");
        showToast(`Ошибка запуска: ${error.message}`, "error");
        state.isPlaying = false;
        updateButtonStates();
    }
}