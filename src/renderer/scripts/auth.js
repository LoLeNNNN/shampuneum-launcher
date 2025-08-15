import { state, elements } from './state.js';
import { appendLog, showToast, updateStatus, updateButtonStates } from './logs.js';
import { checkClientStatus } from './client.js';
import { updateProfileInfo } from './profile.js';

// Показать информацию о сохранённом аккаунте
function showSavedAccountInfo(username) {
    const savedInfo = document.getElementById("saved-account-info");
    const savedUsernameEl = document.getElementById("saved-username");
    const clearSavedBtn = document.getElementById("clear-saved-btn");
    const rememberCheckbox = document.getElementById("remember-me");
    
    if (savedInfo && savedUsernameEl) {
        savedUsernameEl.textContent = username;
        savedInfo.style.display = "flex";
        
        if (clearSavedBtn) {
            clearSavedBtn.style.display = "inline-block";
        }
        
        if (elements.usernameInput) {
            elements.usernameInput.value = username;
            elements.usernameInput.setAttribute("readonly", true);
        }
        
        if (rememberCheckbox) {
            rememberCheckbox.checked = true;
        }
    }
}

// Скрыть информацию о сохранённом аккаунте
function hideSavedAccountInfo() {
    const savedInfo = document.getElementById("saved-account-info");
    const clearSavedBtn = document.getElementById("clear-saved-btn");
    
    if (savedInfo) savedInfo.style.display = "none";
    if (clearSavedBtn) clearSavedBtn.style.display = "none";
    
    if (elements.usernameInput) {
        elements.usernameInput.value = "";
        elements.usernameInput.removeAttribute("readonly");
    }
}

// Проверить сохранённый аккаунт
export async function checkSavedAccount() {
    if (!state.isElectron || !state.electronAPI) return null;
    
    try {
        const savedAccount = await state.electronAPI.getSavedAccount();
        if (savedAccount) {
            appendLog(`Найден сохраненный аккаунт: ${savedAccount.username}`, "info");
            showSavedAccountInfo(savedAccount.username);
            return savedAccount;
        }
    } catch (error) {
        appendLog("Ошибка загрузки сохраненного аккаунта: " + error.message, "error");
    }
    return null;
}

// Автологин
export async function attemptAutoLogin() {
    if (!state.isElectron || !state.electronAPI) return false;
    
    try {
        appendLog("Попытка автоавторизации...", "info");
        const authResult = await state.electronAPI.autoLogin();
        
        if (authResult.success) {
            showToast("Автоавторизация успешна", "success");
            setAuthenticatedUser({
                username: authResult.username,
                access: authResult.access,
                autoLogin: true
            });
            return true;
        } else {
            appendLog("Автоавторизация неудачна: " + authResult.message, "warning");
            if (authResult.message !== "Нет сохраненных данных аккаунта") {
                showToast("Требуется повторная авторизация", "info");
                hideSavedAccountInfo();
            }
            return false;
        }
    } catch (error) {
        appendLog("Ошибка автоавторизации: " + error.message, "error");
        return false;
    }
}

// Очистить сохранённый аккаунт
export async function clearSavedAccount() {
    if (!state.isElectron || !state.electronAPI) return;
    
    if (!confirm("Удалить сохраненные данные аккаунта?")) return;
    
    try {
        await state.electronAPI.clearSavedAccount();
        hideSavedAccountInfo();
        showToast("Сохраненный аккаунт удален", "info");
        appendLog("Данные сохраненного аккаунта очищены", "info");
    } catch (error) {
        showToast("Ошибка при удалении аккаунта", "error");
        appendLog("Ошибка очистки аккаунта: " + error.message, "error");
    }
}

// Установить авторизованного пользователя
export function setAuthenticatedUser(user) {
    state.isAuthenticated = true;
    state.currentUser = user;
    
    if (elements.loginModal) elements.loginModal.style.display = "none";
    if (elements.launcher) elements.launcher.style.display = "flex";
    
    if (elements.usernameDisplay) {
        elements.usernameDisplay.textContent = user.username || "Пользователь";
    }
    
    if (elements.userAccess) {
        elements.userAccess.textContent = `Проходка: ${user.access || "навсегда"}`;
    }
    
    updateProfileInfo(user);
    appendLog(`Пользователь ${user.username} авторизован`, "success");
    
    setTimeout(() => {
        checkClientStatus();
    }, 500);
}

// Обработка логина
export async function handleLogin() {
    const username = elements.usernameInput?.value?.trim();
    const password = elements.passwordInput?.value?.trim();
    const rememberMe = document.getElementById("remember-me")?.checked || false;
    
    if (!username || !password) {
        showToast("Введите логин и пароль", "error");
        return;
    }
    
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
        showToast("Ник должен содержать 3-16 символов (a-z, 0-9, _)", "error");
        return;
    }
    
    try {
        let authResult;
        if (state.isElectron && state.electronAPI) {
            authResult = await state.electronAPI.sendAuthRequest({
                username,
                password,
                rememberMe
            });
        } else {
            const response = await fetch("http://95.79.192.194:3000/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });
            authResult = await response.json();
        }
        
        if (authResult.success) {
            showToast("Авторизация успешна", "success");
            if (authResult.remembered) {
                appendLog("Данные аккаунта сохранены для автоавторизации", "info");
            }
            setAuthenticatedUser({
                username: authResult.username,
                access: authResult.access
            });
        } else {
            showToast(authResult.message || "Ошибка авторизации", "error");
        }
    } catch (error) {
        appendLog("Ошибка авторизации: " + error.message, "error");
        showToast("Ошибка соединения", "error");
    }
}

// Обработка выхода
export async function handleLogout() {
    const confirmLogout = confirm("Вы уверены, что хотите выйти из аккаунта?");
    if (!confirmLogout) return;
    
    try {
        state.isAuthenticated = false;
        state.currentUser = null;
        
        if (state.isElectron && state.electronAPI) {
            await state.electronAPI.clearCurrentUser();
        }
        
        if (elements.launcher) elements.launcher.style.display = "none";
        if (elements.loginModal) elements.loginModal.style.display = "flex";
        
        if (elements.usernameInput) elements.usernameInput.value = "";
        if (elements.passwordInput) elements.passwordInput.value = "";
        
        updateStatus("offline", "Не авторизован");
        resetSkinPreview();
        showToast("Вы вышли из аккаунта", "info");
        appendLog("Выход из аккаунта выполнен", "info");
    } catch (error) {
        showToast("Ошибка при выходе из аккаунта", "error");
        appendLog(`Ошибка выхода: ${error.message}`, "error");
    }
}

// Проверка авторизации
export async function checkAuth() {
    try {
        if (state.isElectron && state.electronAPI) {
            const user = await state.electronAPI.getCurrentUser();
            if (user) {
                setAuthenticatedUser(user);
                return true;
            }
            
            const savedAccount = await checkSavedAccount();
            if (savedAccount) {
                return await attemptAutoLogin();
            }
        }
    } catch (error) {
        appendLog("Ошибка проверки авторизации: " + error.message, "error");
    }
    return false;
}