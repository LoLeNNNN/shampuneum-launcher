import { state, elements } from './state.js';
import { appendLog, showToast } from './logs.js';
import { normalizeMemoryValue } from './utils.js';
import { getSystemInfo, checkSystemJava, updateJavaStatus } from './utils.js';

// Загрузка настроек
export async function loadSettings() {
    if (!state.isElectron || !state.electronAPI) return;
    
    try {
        const [settings, systemInfo, javaInfo] = await Promise.all([
            state.electronAPI.loadSettings(),
            getSystemInfo(),
            checkSystemJava()
        ]);
        
        if (systemInfo && elements.maxMemoryInput) {
            const maxSlider = elements.maxMemoryInput;
            maxSlider.max = systemInfo.maxRecommended;
            const memValue = parseInt(settings?.maxMemory) || systemInfo.recommendedMemory;
            maxSlider.value = Math.min(memValue, systemInfo.maxRecommended);
            
            if (elements.maxMemoryValue) {
                elements.maxMemoryValue.textContent = `${maxSlider.value} GB`;
            }
            
            updateMemoryInfo(systemInfo);
        }
        
        if (elements.javaPathInput) {
            let javaPath = settings?.javaPath || "(Автоматически)";
            if (javaInfo && javaInfo.compatible && javaPath === "(Автоматически)") {
                javaPath = `(Системная Java ${javaInfo.version})`;
                updateJavaStatus(javaInfo);
            } else if (javaPath === "(Автоматически)") {
                updateJavaStatus(null);
            }
            elements.javaPathInput.value = javaPath;
        }
        
        if (elements.minMemorySelect) {
            elements.minMemorySelect.value = settings?.minMemory || "2G";
        }
        
        if (elements.versionSelect && settings?.modpack) {
            elements.versionSelect.value = settings.modpack;
        }
        
        appendLog("Настройки загружены с автоопределением системы", "success");
    } catch (error) {
        appendLog("Ошибка загрузки настроек: " + error.message, "error");
    }
}

// Обновление информации о памяти
function updateMemoryInfo(systemInfo) {
    const memoryInfoEl = document.getElementById("memory-system-info");
    if (memoryInfoEl && systemInfo) {
        memoryInfoEl.innerHTML = `
            <div class="system-info-item">
                <span class="info-label">Всего ОЗУ:</span>
                <span class="info-value">${systemInfo.totalMemory} GB</span>
            </div>
            <div class="system-info-item">
                <span class="info-label">Рекомендуется:</span>
                <span class="info-value">${systemInfo.recommendedMemory} GB</span>
            </div>
        `;
    }
}

// Настройка слайдеров памяти
export function setupMemorySliders() {
    if (elements.maxMemoryInput) {
        elements.maxMemoryInput.addEventListener("input", () => {
            const value = parseInt(elements.maxMemoryInput.value);
            if (elements.maxMemoryValue) {
                elements.maxMemoryValue.textContent = `${value} GB`;
            }
            
            if (elements.minMemorySelect) {
                const minValue = parseInt(elements.minMemorySelect.value);
                if (minValue >= value) {
                    elements.minMemorySelect.value = `${Math.max(1, value - 1)}`;
                    appendLog(`Минимальная память скорректирована до ${Math.max(1, value - 1)} GB`);
                }
            }
            appendLog(`Максимальная память: ${value} GB`);
        });
    }
    
    if (elements.minMemorySelect) {
        elements.minMemorySelect.addEventListener("change", () => {
            const minValue = parseInt(elements.minMemorySelect.value);
            const maxValue = parseInt(elements.maxMemoryInput?.value || 4);
            
            if (minValue >= maxValue) {
                showToast("Минимальная память не может быть больше максимальной", "warning");
                elements.minMemorySelect.value = `${Math.max(1, maxValue - 1)}`;
            }
        });
    }
}

// Настройка выбора пути Java
export function setupJavaPathHandler() {
    if (elements.selectJavaPathBtn) {
        elements.selectJavaPathBtn.addEventListener("click", async () => {
            if (!state.isElectron || !state.electronAPI) {
                showToast("Функция доступна только в приложении", "error");
                return;
            }
            
            try {
                const result = await state.electronAPI.selectJavaPath();
                if (result.filePaths?.length > 0 && elements.javaPathInput) {
                    elements.javaPathInput.value = result.filePaths[0];
                    appendLog(`Выбран путь к Java: ${result.filePaths[0]}`);
                }
            } catch (error) {
                appendLog(`Ошибка выбора Java: ${error.message}`, "error");
            }
        });
    }
}

// Сохранение настроек
export async function saveSettings() {
    if (!state.isElectron || !state.electronAPI) return;
    
    const settings = {
        maxMemory: elements.maxMemoryInput ? `${elements.maxMemoryInput.value}G` : "4G",
        minMemory: elements.minMemorySelect ? `${elements.minMemorySelect.value}G` : "2G",
        javaPath: elements.javaPathInput ? elements.javaPathInput.value : "(Автоматически)",
        modpack: elements.versionSelect ? elements.versionSelect.value : "ULTRA",
        highPriority: document.getElementById("high-priority")?.checked || false,
        gcOptimization: document.getElementById("gc-optimization")?.checked || true,
        autoUpdates: document.getElementById("auto-updates")?.checked || true,
        closeLauncher: document.getElementById("close-launcher")?.checked || false
    };
    
    try {
        await state.electronAPI.saveSettings(settings);
        appendLog("Настройки сохранены с новыми параметрами", "success");
        showToast("Настройки успешно сохранены!");
    } catch (error) {
        appendLog(`Ошибка сохранения настроек: ${error.message}`, "error");
        showToast(`Ошибка сохранения: ${error.message}`, "error");
    }
}

// Сброс настроек
export async function resetSettings() {
    if (!confirm("Вы уверены, что хотите сбросить все настройки?")) return;
    
    const systemInfo = await getSystemInfo();
    const defaultSettings = {
        maxMemory: systemInfo ? `${systemInfo.recommendedMemory}G` : "4G",
        minMemory: "2G",
        javaPath: "(Автоматически)",
        modpack: "ULTRA",
        highPriority: false,
        gcOptimization: true,
        autoUpdates: true,
        closeLauncher: false
    };
    
    try {
        if (state.isElectron && state.electronAPI) {
            await state.electronAPI.saveSettings(defaultSettings);
        }
        await loadSettings();
        showToast("Настройки сброшены к значениям по умолчанию", "success");
        appendLog("Настройки сброшены", "info");
    } catch (error) {
        showToast(`Ошибка сброса настроек: ${error.message}`, "error");
        appendLog(`Ошибка сброса настроек: ${error.message}`, "error");
    }
}

// Получение информации о приложении
export async function getAppInfo() {
    if (!state.isElectron || !state.electronAPI) return;
    
    try {
        const version = await state.electronAPI.getAppVersion();
        appendLog(`Версия лаунчера: ${version}`);
        
        const versionElement = document.querySelector(".version-info");
        if (versionElement) {
            versionElement.textContent = `Лаунчер v${version}`;
        }
    } catch (error) {
        appendLog("Не удалось получить версию лаунчера", "warning");
    }
}