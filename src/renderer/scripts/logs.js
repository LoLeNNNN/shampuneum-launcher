import { state, elements } from './state.js';

// Добавление записи в лог
export function appendLog(text, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${text}`;
    console.log(logEntry);
    state.logs.push(logEntry);
    
    if (elements.logContainer) {
        elements.logContainer.textContent = state.logs.join("\n");
        elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
    }
}

// Показать уведомление
export function showToast(message, type = "success") {
    if (!elements.toast) return;
    
    const messageEl = elements.toast.querySelector(".toast-message");
    if (messageEl) messageEl.textContent = message;
    
    elements.toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        elements.toast.classList.remove("show");
    }, 3000);
}

// Обновление статуса
export function updateStatus(status, text) {
    if (elements.statusDot) {
        elements.statusDot.className = `status-dot ${status}`;
    }
    
    if (elements.statusText) {
        elements.statusText.textContent = text;
    }
    
    if (elements.statusContainer) {
        elements.statusContainer.className = "status";
        if (status === "installing") {
            elements.statusContainer.classList.add("installing");
        } else if (status === "offline") {
            elements.statusContainer.classList.add("offline");
        }
    }
}

// Обновление состояния кнопок
export function updateButtonStates() {
    if (elements.installBtn) elements.installBtn.classList.add("hidden");
    if (elements.playBtn) elements.playBtn.classList.add("hidden");
    if (elements.checkStatusBtn) elements.checkStatusBtn.classList.add("hidden");
    
    if (state.isInstalling) {
        if (elements.installBtn) {
            elements.installBtn.disabled = true;
            elements.installBtn.textContent = "УСТАНОВКА...";
            elements.installBtn.classList.remove("hidden");
        }
        updateStatus("installing", "Установка...");
    } else if (state.isPlaying) {
        if (elements.playBtn) {
            elements.playBtn.disabled = true;
            elements.playBtn.textContent = "ЗАПУСК...";
            elements.playBtn.classList.remove("hidden");
        }
        updateStatus("installing", "Запуск игры...");
    } else {
        if (elements.installBtn) {
            elements.installBtn.disabled = false;
            elements.installBtn.textContent = "УСТАНОВИТЬ";
        }
        if (elements.playBtn) {
            elements.playBtn.disabled = false;
            elements.playBtn.textContent = "ИГРАТЬ";
        }
        if (state.isClientInstalled) {
            if (elements.playBtn) elements.playBtn.classList.remove("hidden");
            if (elements.checkStatusBtn) elements.checkStatusBtn.classList.remove("hidden");
            updateStatus("", "Готов к игре");
        } else {
            if (elements.installBtn) elements.installBtn.classList.remove("hidden");
            if (elements.checkStatusBtn) elements.checkStatusBtn.classList.remove("hidden");
            updateStatus("offline", "Клиент не установлен");
        }
    }
}