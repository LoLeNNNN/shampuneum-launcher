import { state, elements } from './state.js';

// Нормализация значения памяти
export function normalizeMemoryValue(value, defaultValue = "4G") {
    if (!value) return defaultValue;
    const numValue = value.toString().replace("G", "");
    return isNaN(numValue) ? defaultValue : `${numValue}G`;
}

// Обновление информации о памяти
export function updateMemoryPercentage() {
    const maxMemory = parseInt(elements.maxMemoryInput?.value || 4);
    const percentageEl = document.getElementById("memory-percentage");
    
    if (percentageEl) {
        getSystemInfo().then((systemInfo) => {
            if (systemInfo) {
                const percentage = Math.round((maxMemory / systemInfo.totalMemory) * 100);
                percentageEl.textContent = `(${percentage}% от ${systemInfo.totalMemory}GB)`;
                
                if (percentage > 80) {
                    percentageEl.style.color = "#ef4444";
                } else if (percentage > 60) {
                    percentageEl.style.color = "#f59e0b";
                } else {
                    percentageEl.style.color = "#22c55e";
                }
            }
        });
    }
}

// Получение информации о системе
export async function getSystemInfo() {
    if (!state.isElectron || !state.electronAPI) {
        return {
            totalMemory: 8,
            recommendedMemory: 4,
            maxRecommended: 8
        };
    }
    
    try {
        const systemInfo = await state.electronAPI.getSystemInfo();
        if (systemInfo) {
            const totalMemoryGB = systemInfo.totalMemory;
            const recommendedMemory = Math.max(2, Math.floor(totalMemoryGB * 0.5));
            const maxRecommended = Math.min(16, Math.floor(totalMemoryGB * 0.8));
            return {
                totalMemory: totalMemoryGB,
                recommendedMemory,
                maxRecommended
            };
        }
    } catch (error) {
        console.error("Ошибка получения информации о системе:", error);
    }
    
    return {
        totalMemory: 8,
        recommendedMemory: 4,
        maxRecommended: 8
    };
}

// Проверка системной Java
export async function checkSystemJava() {
    if (!state.isElectron || !state.electronAPI) return null;
    
    try {
        const result = await state.electronAPI.checkSystemJava();
        if (result && result.version) {
            const majorVersion = result.version;
            const isCompatible = majorVersion >= 21;
            return {
                version: majorVersion,
                compatible: isCompatible,
                path: "java"
            };
        }
    } catch (error) {
        console.error("Системная Java не найдена:", error);
    }
    return null;
}

// Обновление информации о Java
export function updateJavaStatus(javaInfo) {
    const javaStatusEl = document.getElementById("java-status");
    if (!javaStatusEl) return;
    
    if (javaInfo && javaInfo.compatible) {
        javaStatusEl.innerHTML = `
            <div class="java-status-item success">
                <span class="status-icon">✅</span>
                <span>Совместимая Java ${javaInfo.version} найдена</span>
            </div>
        `;
    } else if (javaInfo && !javaInfo.compatible) {
        javaStatusEl.innerHTML = `
            <div class="java-status-item warning">
                <span class="status-icon">⚠️</span>
                <span>Java ${javaInfo.version} устарела (нужна 21+)</span>
            </div>
        `;
    } else {
        javaStatusEl.innerHTML = `
            <div class="java-status-item info">
                <span class="status-icon">ℹ️</span>
                <span>Будет установлена Java 24</span>
            </div>
        `;
    }
}