import { state } from './state.js';
import { appendLog, showToast } from './logs.js';

// Показать модальное окно обновления
function showUpdateModal(updateInfo) {
    state.currentUpdateInfo = updateInfo;
    
    const versionText = document.getElementById("update-version-text");
    const sizeText = document.getElementById("update-size-text");
    const dateText = document.getElementById("update-date-text");
    const typeText = document.getElementById("update-type-text");
    const changelog = document.getElementById("update-changelog");
    
    if (versionText) versionText.textContent = updateInfo.version;
    if (sizeText) sizeText.textContent = updateInfo.size;
    if (dateText) dateText.textContent = updateInfo.publishDate;
    
    if (typeText) {
        typeText.textContent = updateInfo.isPortable 
            ? "Портативная версия" 
            : "Установщик";
    }
    
    if (changelog) changelog.textContent = updateInfo.changelog;
    
    const modal = document.getElementById("update-modal");
    if (modal) {
        modal.style.display = "flex";
        setTimeout(() => {
            modal.classList.add("show");
        }, 10);
    }
    
    appendLog(`Доступно обновление до версии ${updateInfo.version}`, "info");
}

// Скрыть модальное окно обновления
function hideUpdateModal() {
    const modal = document.getElementById("update-modal");
    if (modal) {
        modal.classList.remove("show");
        setTimeout(() => {
            modal.style.display = "none";
        }, 300);
    }
    state.currentUpdateInfo = null;
}

// Показать прогресс обновления
function showUpdateProgress() {
    const progressSection = document.getElementById("update-progress-section");
    const buttons = document.querySelector(".modal-buttons");
    
    if (progressSection) progressSection.style.display = "block";
    if (buttons) buttons.style.display = "none";
}

// Обновить прогресс загрузки
function updateDownloadProgress(progress) {
    const progressFill = document.getElementById("update-progress-fill");
    const progressText = document.getElementById("progress-percentage");
    
    if (progressFill) {
        progressFill.style.width = progress + "%";
    }
    
    if (progressText) {
        progressText.textContent = progress + "%";
    }
}

// Обработка загрузки обновления
export async function handleUpdateDownload() {
    if (!state.currentUpdateInfo || state.isUpdating) return;
    
    state.isUpdating = true;
    showUpdateProgress();
    
    const updateNowBtn = document.getElementById("update-now-btn");
    if (updateNowBtn) {
        updateNowBtn.disabled = true;
        updateNowBtn.innerHTML = '<span class="btn-icon">⏳</span> Загрузка...';
    }
    
    try {
        appendLog(`Начинается загрузка обновления ${state.currentUpdateInfo.version}`, "info");
        
        let progressTimeout;
        let lastProgressUpdate = Date.now();
        
        window.electronAPI.onUpdateProgress((event, progress) => {
            updateDownloadProgress(progress);
            lastProgressUpdate = Date.now();
            
            clearTimeout(progressTimeout);
            progressTimeout = setTimeout(() => {
                const timeSinceLastUpdate = Date.now() - lastProgressUpdate;
                if (timeSinceLastUpdate > 30000 && progress < 100) {
                    appendLog(`Возможное зависание на ${progress}%. Попробуйте позже.`, "warning");
                }
            }, 30000);
        });
        
        const result = await window.electronAPI.downloadUpdate(
            state.currentUpdateInfo.downloadUrl,
            state.currentUpdateInfo.fileName
        );
        
        clearTimeout(progressTimeout);
        
        if (result.success) {
            appendLog("Обновление успешно установлено!", "success");
            showToast("Обновление установлено! Лаунчер будет перезапущен", "success");
            
            const progressSection = document.getElementById("update-progress-section");
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
            throw new Error(result.error || "Неизвестная ошибка загрузки");
        }
    } catch (error) {
        appendLog(`Ошибка загрузки обновления: ${error.message}`, "error");
        showToast(`Ошибка обновления: ${error.message}`, "error");
        
        if (updateNowBtn) {
            updateNowBtn.disabled = false;
            updateNowBtn.innerHTML = '<span class="btn-icon">⬇️</span> Обновить сейчас';
        }
        
        const progressSection = document.getElementById("update-progress-section");
        const buttons = document.querySelector(".modal-buttons");
        if (progressSection) progressSection.style.display = "none";
        if (buttons) buttons.style.display = "flex";
    } finally {
        state.isUpdating = false;
    }
}

// Ручная проверка обновлений
export async function checkForUpdatesManually() {
    if (!window.electronAPI) {
        showToast("Функция доступна только в приложении", "error");
        return;
    }
    
    try {
        appendLog("Проверка обновлений...", "info");
        const result = await window.electronAPI.checkUpdates();
        
        if (result.available) {
            showUpdateModal(result);
        } else {
            showToast("У вас установлена последняя версия", "success");
            appendLog("Обновлений не найдено", "info");
        }
    } catch (error) {
        showToast(`Ошибка проверки обновлений: ${error.message}`, "error");
        appendLog(`Ошибка проверки обновлений: ${error.message}`, "error");
    }
}

// Настройка обработчиков обновлений
export function setupUpdateHandlers() {
    const updateModal = document.getElementById("update-modal");
    const updateNowBtn = document.getElementById("update-now-btn");
    const updateLaterBtn = document.getElementById("update-later-btn");
    const skipVersionBtn = document.getElementById("skip-version-btn");
    
    if (window.electronAPI?.onUpdateAvailable) {
        window.electronAPI.onUpdateAvailable((event, updateInfo) => {
            showUpdateModal(updateInfo);
        });
    }
    
    if (window.electronAPI?.onUpdateProgress) {
        window.electronAPI.onUpdateProgress((event, progress) => {
            updateDownloadProgress(progress);
        });
    }
    
    if (updateNowBtn) {
        updateNowBtn.addEventListener("click", handleUpdateDownload);
    }
    
    if (updateLaterBtn) {
        updateLaterBtn.addEventListener("click", () => {
            hideUpdateModal();
            showToast("Обновление отложено", "info");
        });
    }
    
    if (skipVersionBtn) {
        skipVersionBtn.addEventListener("click", async () => {
            if (!state.currentUpdateInfo) return;
            
            try {
                await window.electronAPI.skipUpdateVersion(state.currentUpdateInfo.version);
                hideUpdateModal();
                showToast(`Версия ${state.currentUpdateInfo.version} пропущена`, "info");
            } catch (error) {
                showToast("Ошибка при пропуске версии", "error");
            }
        });
    }
}