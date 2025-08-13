(function () {
  const isElectron = typeof window !== "undefined" && window.electronAPI;
  let electronAPI = null;
  if (isElectron) {
    electronAPI = window.electronAPI;
  }
  let isInstalling = false;
  let isPlaying = false;
  let isClientInstalled = false;
  let clientStatus = null;
  let currentTab = "home";
  let logs = [];
  let updateAvailable = false;
  let isAuthenticated = false;
  let currentUser = null;
  let currentUpdateInfo = null;
  let isUpdating = false;
  let currentSkinPreview = null;
  let skinPreviewBlob = null;
  const elements = {
    loginModal: document.getElementById("login-modal"),
    loginButton: document.getElementById("login-button"),
    usernameInput: document.getElementById("username"),
    passwordInput: document.getElementById("password"),
    resetBtn: document.getElementById("reset-settings"),
    launcher: document.getElementById("launcher"),
    usernameDisplay: document.getElementById("username-display"),
    userAccess: document.getElementById("user-access"),
    checkUpdatesBtn: document.getElementById("check-updates-manual"),
    installBtn: document.getElementById("install"),
    playBtn: document.getElementById("play-btn"),
    checkStatusBtn: document.getElementById("check-status"),
    exitBtn: document.getElementById("logout"),
    statusDot: document.getElementById("status-dot"),
    statusText: document.getElementById("status-text"),
    statusContainer: document.getElementById("status-container"),
    maxMemoryInput: document.getElementById("max-memory"),
    maxMemoryValue: document.getElementById("max-memory-value"),
    minMemorySelect: document.getElementById("min-memory"),
    javaPathInput: document.getElementById("java-path"),
    selectJavaPathBtn: document.getElementById("select-java-path"),
    saveSettingsBtn: document.getElementById("save-settings"),
    menuItems: document.querySelectorAll(".menu-item"),
    tabContents: document.querySelectorAll(".tab-content"),
    toast: document.getElementById("toast"),
    logContainer: document.getElementById("log-container"),
    updateBadge: document.getElementById("update-badge"),
    versionSelect: document.getElementById("version-select"),
  };
  function appendLog(text, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${text}`;
    console.log(logEntry);
    logs.push(logEntry);
    if (elements.logContainer) {
      elements.logContainer.textContent = logs.join("\n");
      elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
    }
  }
  function showToast(message, type = "success") {
    if (!elements.toast) return;
    const messageEl = elements.toast.querySelector(".toast-message");
    if (messageEl) messageEl.textContent = message;
    elements.toast.className = `toast ${type} show`;
    setTimeout(() => {
      elements.toast.classList.remove("show");
    }, 3000);
  }
  function setupUpdateHandlers() {
    const updateModal = document.getElementById("update-modal");
    const updateNowBtn = document.getElementById("update-now-btn");
    const updateLaterBtn = document.getElementById("update-later-btn");
    const skipVersionBtn = document.getElementById("skip-version-btn");
    if (window.electronAPI && window.electronAPI.onUpdateAvailable) {
      window.electronAPI.onUpdateAvailable((event, updateInfo) => {
        showUpdateModal(updateInfo);
      });
    }
    if (window.electronAPI && window.electronAPI.onUpdateProgress) {
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
        if (!currentUpdateInfo) return;
        try {
          await window.electronAPI.skipUpdateVersion(currentUpdateInfo.version);
          hideUpdateModal();
          showToast(`Версия ${currentUpdateInfo.version} пропущена`, "info");
        } catch (error) {
          showToast("Ошибка при пропуске версии", "error");
        }
      });
    }
  }
  async function checkSavedAccount() {
    if (!isElectron || !electronAPI) return null;
    try {
      const savedAccount = await electronAPI.getSavedAccount();
      if (savedAccount) {
        appendLog(
          `Найден сохраненный аккаунт: ${savedAccount.username}`,
          "info"
        );
        showSavedAccountInfo(savedAccount.username);
        return savedAccount;
      }
    } catch (error) {
      appendLog(
        "Ошибка загрузки сохраненного аккаунта: " + error.message,
        "error"
      );
    }
    return null;
  }
  function showSavedAccountInfo(username) {
    const savedInfo = document.getElementById("saved-account-info");
    const savedUsernameEl = document.getElementById("saved-username");
    const clearSavedBtn = document.getElementById("clear-saved-btn");
    const usernameInput = elements.usernameInput;
    const rememberCheckbox = document.getElementById("remember-me");
    if (savedInfo && savedUsernameEl) {
      savedUsernameEl.textContent = username;
      savedInfo.style.display = "flex";
      if (clearSavedBtn) {
        clearSavedBtn.style.display = "inline-block";
      }
      if (usernameInput) {
        usernameInput.value = username;
        usernameInput.setAttribute("readonly", true);
      }
      if (rememberCheckbox) {
        rememberCheckbox.checked = true;
      }
    }
  }
  function hideSavedAccountInfo() {
    const savedInfo = document.getElementById("saved-account-info");
    const clearSavedBtn = document.getElementById("clear-saved-btn");
    const usernameInput = elements.usernameInput;
    if (savedInfo) {
      savedInfo.style.display = "none";
    }
    if (clearSavedBtn) {
      clearSavedBtn.style.display = "none";
    }
    if (usernameInput) {
      usernameInput.value = "";
      usernameInput.removeAttribute("readonly");
    }
  }
  async function attemptAutoLogin() {
    if (!isElectron || !electronAPI) return false;
    try {
      appendLog("Попытка автоавторизации...", "info");
      const authResult = await electronAPI.autoLogin();
      if (authResult.success) {
        showToast("Автоавторизация успешна", "success");
        setAuthenticatedUser({
          username: authResult.username,
          access: authResult.access,
          autoLogin: true,
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
  async function clearSavedAccount() {
    if (!isElectron || !electronAPI) return;
    if (!confirm("Удалить сохраненные данные аккаунта?")) {
      return;
    }
    try {
      await electronAPI.clearSavedAccount();
      hideSavedAccountInfo();
      showToast("Сохраненный аккаунт удален", "info");
      appendLog("Данные сохраненного аккаунта очищены", "info");
    } catch (error) {
      showToast("Ошибка при удалении аккаунта", "error");
      appendLog("Ошибка очистки аккаунта: " + error.message, "error");
    }
  }
  function showUpdateModal(updateInfo) {
    currentUpdateInfo = updateInfo;
    const versionText = document.getElementById("update-version-text");
    const sizeText = document.getElementById("update-size-text");
    const dateText = document.getElementById("update-date-text");
    const typeText = document.getElementById("update-type-text");
    const changelog = document.getElementById("update-changelog");
    if (versionText) versionText.textContent = updateInfo.version;
    if (sizeText) sizeText.textContent = updateInfo.size;
    if (dateText) dateText.textContent = updateInfo.publishDate;
    if (typeText)
      typeText.textContent = updateInfo.isPortable
        ? "Портативная версия"
        : "Установщик";
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
  function hideUpdateModal() {
    const modal = document.getElementById("update-modal");
    if (modal) {
      modal.classList.remove("show");
      setTimeout(() => {
        modal.style.display = "none";
      }, 300);
    }
    currentUpdateInfo = null;
  }
  function showUpdateProgress() {
    const progressSection = document.getElementById("update-progress-section");
    const buttons = document.querySelector(".modal-buttons");
    if (progressSection) progressSection.style.display = "block";
    if (buttons) buttons.style.display = "none";
  }
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
  async function handleUpdateDownload() {
    if (!currentUpdateInfo || isUpdating) return;
    isUpdating = true;
    showUpdateProgress();
    const updateNowBtn = document.getElementById("update-now-btn");
    if (updateNowBtn) {
      updateNowBtn.disabled = true;
      updateNowBtn.innerHTML = '<span class="btn-icon">⏳</span> Загрузка...';
    }
    try {
      appendLog(
        `Начинается загрузка обновления ${currentUpdateInfo.version}`,
        "info"
      );
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
          if (timeSinceLastUpdate > 30000 && progress < 100) {
            // 30 секунд без обновления
            appendLog(
              `Возможное зависание на ${progress}%. Попробуйте позже.`,
              "warning"
            );
          }
        }, 30000);
      });
      const result = await window.electronAPI.downloadUpdate(
        currentUpdateInfo.downloadUrl,
        currentUpdateInfo.fileName
      );
      clearTimeout(progressTimeout);
      if (result.success) {
        appendLog("Обновление успешно установлено!", "success");
        showToast(
          "Обновление установлено! Лаунчер будет перезапущен",
          "success"
        );
        // Показываем сообщение об успешном обновлении
        const progressSection = document.getElementById(
          "update-progress-section"
        );
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
      // Восстанавливаем кнопку
      if (updateNowBtn) {
        updateNowBtn.disabled = false;
        updateNowBtn.innerHTML =
          '<span class="btn-icon">⬇️</span> Обновить сейчас';
      }
      // Скрываем прогресс и показываем кнопки
      const progressSection = document.getElementById(
        "update-progress-section"
      );
      const buttons = document.querySelector(".modal-buttons");
      if (progressSection) progressSection.style.display = "none";
      if (buttons) buttons.style.display = "flex";
    } finally {
      isUpdating = false;
    }
  }
  async function checkSystemJava() {
    if (!isElectron || !electronAPI) return null;
    try {
      const result = await electronAPI.checkSystemJava();
      if (result && result.version) {
        const majorVersion = result.version;
        const isCompatible = majorVersion >= 21;
        appendLog(
          `Найдена системная Java версии ${majorVersion} (${
            isCompatible ? "совместима" : "несовместима"
          })`,
          isCompatible ? "success" : "warning"
        );
        return {
          version: majorVersion,
          compatible: isCompatible,
          path: "java", 
        };
      }
    } catch (error) {
      appendLog("Системная Java не найдена", "info");
    }
    return null;
  }
  async function getSystemInfo() {
    if (!isElectron || !electronAPI) return null;
    try {
      // Используем electronAPI для получения информации о системе
      const systemInfo = await electronAPI.getSystemInfo();
      if (systemInfo) {
        const totalMemoryGB = systemInfo.totalMemory;
        const recommendedMemory = Math.max(2, Math.floor(totalMemoryGB * 0.5)); // 50% от общей памяти, минимум 2GB
        const maxRecommended = Math.min(16, Math.floor(totalMemoryGB * 0.8)); // Максимум 80% от общей памяти
        return {
          totalMemory: totalMemoryGB,
          recommendedMemory,
          maxRecommended,
        };
      }
    } catch (error) {
      appendLog(
        `Ошибка получения информации о системе: ${error.message}`,
        "error"
      );
    }
    // Возвращаем значения по умолчанию если не удалось получить системную информацию
    return {
      totalMemory: 8,
      recommendedMemory: 4,
      maxRecommended: 8,
    };
  }
  // Ручная проверка обновлений
  async function checkForUpdatesManually() {
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
  function updateStatus(status, text) {
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
  function updateButtonStates() {
    if (elements.installBtn) elements.installBtn.classList.add("hidden");
    if (elements.playBtn) elements.playBtn.classList.add("hidden");
    if (elements.checkStatusBtn)
      elements.checkStatusBtn.classList.add("hidden");
    if (isInstalling) {
      if (elements.installBtn) {
        elements.installBtn.disabled = true;
        elements.installBtn.textContent = "УСТАНОВКА...";
        elements.installBtn.classList.remove("hidden");
      }
      updateStatus("installing", "Установка...");
    } else if (isPlaying) {
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
      if (isClientInstalled) {
        if (elements.playBtn) elements.playBtn.classList.remove("hidden");
        if (elements.checkStatusBtn)
          elements.checkStatusBtn.classList.remove("hidden");
        updateStatus("", "Готов к игре");
      } else {
        if (elements.installBtn) elements.installBtn.classList.remove("hidden");
        if (elements.checkStatusBtn)
          elements.checkStatusBtn.classList.remove("hidden");
        updateStatus("offline", "Клиент не установлен");
      }
    }
  }
  async function checkClientStatus() {
    if (!isElectron || !electronAPI) {
      appendLog("Проверка статуса доступна только в приложении", "warning");
      return;
    }
    appendLog("Проверка статуса клиента...", "info");
    try {
      const status = await electronAPI.checkGameStatus();
      clientStatus = status;
      isClientInstalled = status.clientInstalled;
      appendLog(
        `Статус клиента: ${isClientInstalled ? "установлен" : "не установлен"}`,
        "info"
      );
      if (status.details) {
        appendLog(
          `Подробности: Vanilla=${status.details.vanilla}, Fabric=${status.details.fabric}`,
          "info"
        );
      }
      if (status.error) {
        appendLog(`Ошибка проверки: ${status.error}`, "error");
      }
      updateButtonStates();
    } catch (error) {
      appendLog(`Ошибка проверки статуса: ${error.message}`, "error");
      isClientInstalled = false;
      updateButtonStates();
    }
  }
  function switchTab(tab) {
    elements.tabContents.forEach((content) => {
      content.classList.remove("active");
    });
    const tabContent = document.getElementById(`${tab}-tab`);
    if (tabContent) tabContent.classList.add("active");
    elements.menuItems.forEach((item) => {
      item.classList.remove("active");
      if (item.dataset.tab === tab) {
        item.classList.add("active");
      }
    });
  }
  async function checkAuth() {
    try {
      if (isElectron && electronAPI) {
        // Сначала проверяем текущего пользователя
        const user = await electronAPI.getCurrentUser();
        if (user) {
          setAuthenticatedUser(user);
          return true;
        }
        // Если нет текущего пользователя, пробуем автоавторизацию
        const savedAccount = await checkSavedAccount();
        if (savedAccount) {
          const autoLoginSuccess = await attemptAutoLogin();
          if (autoLoginSuccess) {
            return true;
          }
        }
      }
    } catch (error) {
      appendLog("Ошибка проверки авторизации: " + error.message, "error");
    }
    return false;
  }
  // Добавить эти функции в scripts.js
  // Проверка сохраненного аккаунта при запуске
  async function checkSavedAccount() {
    if (!isElectron || !electronAPI) return null;
    try {
      const savedAccount = await electronAPI.getSavedAccount();
      if (savedAccount) {
        appendLog(
          `Найден сохраненный аккаунт: ${savedAccount.username}`,
          "info"
        );
        showSavedAccountInfo(savedAccount.username);
        return savedAccount;
      }
    } catch (error) {
      appendLog(
        "Ошибка загрузки сохраненного аккаунта: " + error.message,
        "error"
      );
    }
    return null;
  }
  // Показать информацию о сохраненном аккаунте
  function showSavedAccountInfo(username) {
    const savedInfo = document.getElementById("saved-account-info");
    const savedUsernameEl = document.getElementById("saved-username");
    const clearSavedBtn = document.getElementById("clear-saved-btn");
    const usernameInput = elements.usernameInput;
    const rememberCheckbox = document.getElementById("remember-me");
    if (savedInfo && savedUsernameEl) {
      savedUsernameEl.textContent = username;
      savedInfo.style.display = "flex";
      if (clearSavedBtn) {
        clearSavedBtn.style.display = "inline-block";
      }
      if (usernameInput) {
        usernameInput.value = username;
        usernameInput.setAttribute("readonly", true);
      }
      if (rememberCheckbox) {
        rememberCheckbox.checked = true;
      }
    }
  }
  // Скрыть информацию о сохраненном аккаунте
  function hideSavedAccountInfo() {
    const savedInfo = document.getElementById("saved-account-info");
    const clearSavedBtn = document.getElementById("clear-saved-btn");
    const usernameInput = elements.usernameInput;
    if (savedInfo) {
      savedInfo.style.display = "none";
    }
    if (clearSavedBtn) {
      clearSavedBtn.style.display = "none";
    }
    if (usernameInput) {
      usernameInput.value = "";
      usernameInput.removeAttribute("readonly");
    }
  }
  // Попытка автоавторизации с сохраненными данными
  async function attemptAutoLogin() {
    if (!isElectron || !electronAPI) return false;
    try {
      appendLog("Попытка автоавторизации...", "info");
      const authResult = await electronAPI.autoLogin();
      if (authResult.success) {
        showToast("Автоавторизация успешна", "success");
        setAuthenticatedUser({
          username: authResult.username,
          access: authResult.access,
          autoLogin: true,
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
  // Очистка сохраненного аккаунта
  async function clearSavedAccount() {
    if (!isElectron || !electronAPI) return;
    if (!confirm("Удалить сохраненные данные аккаунта?")) {
      return;
    }
    try {
      await electronAPI.clearSavedAccount();
      hideSavedAccountInfo();
      showToast("Сохраненный аккаунт удален", "info");
      appendLog("Данные сохраненного аккаунта очищены", "info");
    } catch (error) {
      showToast("Ошибка при удалении аккаунта", "error");
      appendLog("Ошибка очистки аккаунта: " + error.message, "error");
    }
  }
  // Обновленная функция авторизации
  async function handleLogin() {
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
      if (isElectron && electronAPI) {
        authResult = await electronAPI.sendAuthRequest({
          username,
          password,
          rememberMe,
        });
      } else {
        const response = await fetch("http://95.79.192.194:3000/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
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
          access: authResult.access,
        });
      } else {
        showToast(authResult.message || "Ошибка авторизации", "error");
      }
    } catch (error) {
      appendLog("Ошибка авторизации: " + error.message, "error");
      showToast("Ошибка соединения", "error");
    }
  }
  async function handleLogout() {
    const confirmLogout = confirm("Вы уверены, что хотите выйти из аккаунта?");
    if (!confirmLogout) return;
    try {
      // Очищаем данные пользователя
      isAuthenticated = false;
      currentUser = null;
      // Очищаем сохраненный аккаунт если нужно
      if (isElectron && electronAPI) {
        await electronAPI.clearCurrentUser();
      }
      // Скрываем лаунчер и показываем форму входа
      if (elements.launcher) elements.launcher.style.display = "none";
      if (elements.loginModal) elements.loginModal.style.display = "flex";
      // Очищаем поля формы
      if (elements.usernameInput) elements.usernameInput.value = "";
      if (elements.passwordInput) elements.passwordInput.value = "";
      // Сбрасываем статус
      updateStatus("offline", "Не авторизован");
      // Очищаем превью скина
      resetSkinPreview();
      showToast("Вы вышли из аккаунта", "info");
      appendLog("Выход из аккаунта выполнен", "info");
    } catch (error) {
      showToast("Ошибка при выходе из аккаунта", "error");
      appendLog(`Ошибка выхода: ${error.message}`, "error");
    }
  }
  // Обновить checkAuth для автоавторизации
  async function checkAuth() {
    try {
      if (isElectron && electronAPI) {
        // Сначала проверяем текущего пользователя
        const user = await electronAPI.getCurrentUser();
        if (user) {
          setAuthenticatedUser(user);
          return true;
        }
        // Если нет текущего пользователя, пробуем автоавторизацию
        const savedAccount = await checkSavedAccount();
        if (savedAccount) {
          const autoLoginSuccess = await attemptAutoLogin();
          if (autoLoginSuccess) {
            return true;
          }
        }
      }
    } catch (error) {
      appendLog("Ошибка проверки авторизации: " + error.message, "error");
    }
    return false;
  }
  function setupProfileEventListeners() {
    // Настройка загрузки скина
    setupSkinUpload();
    // Кнопка применения скина
    const applySkinBtn = document.getElementById("apply-skin");
    if (applySkinBtn) {
      applySkinBtn.addEventListener("click", applySkinPreview);
    }
    // Кнопка сброса скина
    const resetSkinBtn = document.getElementById("reset-skin");
    if (resetSkinBtn) {
      resetSkinBtn.addEventListener("click", resetSkinPreview);
    }
    // Кнопка выхода (уже есть в основной функции, но обновляем обработчик)
    if (elements.exitBtn) {
      elements.exitBtn.removeEventListener("click", handleLogout); // Удаляем старый
      elements.exitBtn.addEventListener("click", handleLogout); // Добавляем новый
    }
  }
  function setupClearSavedAccountHandler() {
    const clearSavedBtn = document.getElementById("clear-saved-btn");
    if (clearSavedBtn) {
      clearSavedBtn.addEventListener("click", clearSavedAccount);
    }
  }
  function setAuthenticatedUser(user) {
    isAuthenticated = true;
    currentUser = user;
    if (elements.loginModal) elements.loginModal.style.display = "none";
    if (elements.launcher) elements.launcher.style.display = "flex";
    if (elements.usernameDisplay) {
      elements.usernameDisplay.textContent = user.username || "Пользователь";
    }
    if (elements.userAccess) {
      elements.userAccess.textContent = `Проходка: ${
        user.access || "навсегда"
      }`;
    }
    updateProfileInfo(user);
    appendLog(`Пользователь ${user.username} авторизован`, "success");
    setTimeout(() => {
      checkClientStatus();
    }, 500);
  }
function updateProfileInfo(user) {
  const profileUsername = document.getElementById("profile-username");
  const profileAccess = document.getElementById("profile-access");

  if (profileUsername) {
    profileUsername.textContent = user.username || "Пользователь";
  }

  if (profileAccess) {
    profileAccess.textContent = `Проходка: ${user.access || "навсегда"}`;
  }

  // Комментируем загрузку аватарки по нику
  // updateAvatarSkin(user.username);
}

  function updateAvatarSkin(username) {
    const minecraftSkinUrl = `https://minotar.net/avatar/${username}/100`;
    const avatarElements = document.querySelectorAll(
      ".avatar img, .avatar-sm img"
    );
    avatarElements.forEach((img) => {
      img.src = minecraftSkinUrl;
      img.onerror = function () {
        this.src = "images/image-44.png";
      };
    });
  }
  function setupSkinUpload() {
    const skinUpload = document.getElementById("skin-upload");
    const skinPreview = document.getElementById("skin-preview");
    const previewContainer = document.getElementById("preview-container");
    if (skinUpload) {
      skinUpload.addEventListener("change", handleSkinUpload);
    }
  }
  async function handleSkinUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    // Проверяем тип файла
    if (!file.type.startsWith("image/")) {
      showToast("Пожалуйста, выберите изображение", "error");
      return;
    }
    // Проверяем размер файла (максимум 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast("Файл слишком большой. Максимум 5MB", "error");
      return;
    }
    try {
      // Создаем preview
      const imageUrl = URL.createObjectURL(file);
      await validateAndPreviewSkin(imageUrl, file);
      appendLog(
        `Загружен файл скина: ${file.name} (${(file.size / 1024).toFixed(
          1
        )} KB)`,
        "info"
      );
    } catch (error) {
      showToast(`Ошибка загрузки скина: ${error.message}`, "error");
      appendLog(`Ошибка загрузки скина: ${error.message}`, "error");
    }
  }
  async function validateAndPreviewSkin(imageUrl, file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = function () {
        // Проверяем размеры (стандартный скин Minecraft 64x64 или 64x32)
        const validSizes = [
          { width: 64, height: 64 },
          { width: 64, height: 32 },
        ];
        const isValidSize = validSizes.some(
          (size) => this.width === size.width && this.height === size.height
        );
        if (!isValidSize) {
          showToast(
            "Неверный размер скина. Используйте 64x64 или 64x32 пикселя",
            "warning"
          );
        }
        showSkinPreview(imageUrl, file);
        resolve();
      };
      img.onerror = function () {
        reject(new Error("Не удалось загрузить изображение"));
      };
      img.src = imageUrl;
    });
  }
  function showSkinPreview(imageUrl, file) {
    const previewContainer = document.getElementById("preview-container");
    const skinPreview = document.getElementById("skin-preview");
    const previewInfo = document.getElementById("preview-info");
    if (skinPreview) {
      skinPreview.src = imageUrl;
      skinPreview.style.imageRendering = "pixelated"; // Для четкого отображения пикселей
    }
    if (previewInfo) {
      previewInfo.innerHTML = `
      <div class="preview-details">
        <span><strong>Файл:</strong> ${file.name}</span>
        <span><strong>Размер:</strong> ${(file.size / 1024).toFixed(
          1
        )} KB</span>
        <span><strong>Тип:</strong> ${file.type}</span>
      </div>
    `;
    }
    if (previewContainer) {
      previewContainer.style.display = "block";
    }
    // Сохраняем для применения
    currentSkinPreview = imageUrl;
    skinPreviewBlob = file;
    // Включаем кнопку применения
    const applySkinBtn = document.getElementById("apply-skin");
    if (applySkinBtn) {
      applySkinBtn.disabled = false;
    }
  }
function applySkinPreview() {
  if (!currentSkinPreview) {
    showToast("Сначала выберите скин", "warning");
    return;
  }


  showToast("Загрузка скина пока не работает - функция в разработке", "info");
  appendLog("Попытка применения скина - функция в разработке", "info");
}
  async function simulateSkinUpload() {
    const applySkinBtn = document.getElementById("apply-skin");
    const originalText = applySkinBtn?.textContent;
    if (applySkinBtn) {
      applySkinBtn.disabled = true;
      applySkinBtn.textContent = "Загрузка...";
    }
    try {
      // Имитируем задержку загрузки на сервер
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Здесь будет реальная загрузка на сервер
      // if (isElectron && electronAPI) {
      //   await electronAPI.uploadSkin(skinPreviewBlob, currentUser.username);
      // }
      showToast("Скин сохранен на сервере", "success");
      appendLog("Скин успешно загружен на сервер", "success");
    } catch (error) {
      showToast("Ошибка загрузки скина на сервер", "error");
      appendLog(`Ошибка загрузки на сервер: ${error.message}`, "error");
    } finally {
      if (applySkinBtn) {
        applySkinBtn.disabled = false;
        applySkinBtn.textContent = originalText;
      }
    }
  }
function resetSkinPreview() {
  const skinUpload = document.getElementById("skin-upload");
  const previewContainer = document.getElementById("preview-container");
  const applySkinBtn = document.getElementById("apply-skin");

  if (skinUpload) skinUpload.value = "";
  if (previewContainer) previewContainer.style.display = "none";
  if (applySkinBtn) applySkinBtn.disabled = true;

  if (currentSkinPreview) {
    URL.revokeObjectURL(currentSkinPreview);
  }

  currentSkinPreview = null;
  skinPreviewBlob = null;
  showToast("Превью скина сброшено", "info");
}
  async function handleLogin() {
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
      if (isElectron && electronAPI) {
        authResult = await electronAPI.sendAuthRequest({
          username,
          password,
          rememberMe,
        });
      } else {
        const response = await fetch("http://95.79.192.194:3000/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
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
          access: authResult.access,
        });
      } else {
        showToast(authResult.message || "Ошибка авторизации", "error");
      }
    } catch (error) {
      appendLog("Ошибка авторизации: " + error.message, "error");
      showToast("Ошибка соединения", "error");
    }
  }
  async function handleInstall() {
    if (isInstalling || !isAuthenticated) return;
    isInstalling = true;
    updateButtonStates();
    // Получаем настройки производительности
    const highPriority =
      document.getElementById("high-priority")?.checked || false;
    const gcOptimization =
      document.getElementById("gc-optimization")?.checked || true;
    const options = {
      version: "1.21.8",
      maxMemory: elements.maxMemoryInput
        ? `${elements.maxMemoryInput.value}`
        : "4G",
      minMemory: elements.minMemorySelect
        ? elements.minMemorySelect.value
        : "2G",
      javaPath:
        elements.javaPathInput?.value === "(Автоматически)"
          ? undefined
          : elements.javaPathInput?.value,
      modpack: elements.versionSelect ? elements.versionSelect.value : "ULTRA",
      highPriority,
      gcOptimization,
    };
    appendLog(
      `Запуск установки клиента версии ${options.version} с модпаком ${options.modpack}...`
    );
    appendLog(
      `Настройки: Память ${options.minMemory}-${
        options.maxMemory
      }, GC оптимизация: ${gcOptimization ? "да" : "нет"}`
    );
    try {
      if (!isElectron || !electronAPI) {
        throw new Error("Функция доступна только в приложении");
      }
      const result = await electronAPI.installClient(options);
      appendLog(
        `Установка завершена: ${result.message || "Успешно"}`,
        "success"
      );
      await checkClientStatus();
      showToast("Клиент успешно установлен!", "success");
    } catch (error) {
      appendLog(`Ошибка установки: ${error.message}`, "error");
      showToast(`Ошибка установки: ${error.message}`, "error");
    } finally {
      isInstalling = false;
      updateButtonStates();
    }
  }
async function handlePlay() {
  if (isPlaying || !isAuthenticated) return;
  if (!isClientInstalled) {
    showToast("Сначала установите клиент", "error");
    return;
  }
  isPlaying = true;
  updateButtonStates();
  
  const highPriority =
    document.getElementById("high-priority")?.checked || false;
  const gcOptimization =
    document.getElementById("gc-optimization")?.checked || true;
  const closeLauncher =
    document.getElementById("close-launcher")?.checked || false;
  const version = elements.versionSelect
    ? elements.versionSelect.value.split("-")[0]
    : "1.21.8";
  const options = {
    version: version,
    useAdmin: false,
    maxMemory: elements.maxMemoryInput
      ? `${elements.maxMemoryInput.value}`
      : "4G",
    minMemory: elements.minMemorySelect
      ? `${elements.minMemorySelect.value}`
      : "2G",
    javaPath:
      elements.javaPathInput?.value === "(Автоматически)"
        ? undefined
        : elements.javaPathInput?.value,
    modpack: elements.versionSelect ? elements.versionSelect.value : "ULTRA",
    highPriority,
    gcOptimization,
    closeLauncher,
  };
  
  appendLog(
    `Запуск Minecraft ${options.version} для игрока ${currentUser?.username}`
  );
  appendLog(
    `Настройки производительности: Приоритет ${
      highPriority ? "высокий" : "обычный"
    }, GC оптимизация: ${gcOptimization ? "да" : "нет"}`
  );
  
  try {
    if (!isElectron || !electronAPI) {
      throw new Error("Функция доступна только в приложении");
    }
    const result = await electronAPI.launchMinecraft(options);
    appendLog(
      `Minecraft запущен (PID: ${result.pid}) для игрока ${result.username}`,
      "success"
    );
    showToast("Minecraft запущен!", "success");
    if (closeLauncher) {
      appendLog("Закрытие лаунчера по настройкам пользователя...");
      setTimeout(async () => {
        if (isElectron && electronAPI) {
          await electronAPI.quitApp();
        }
      }, 3000);
    } else {
      setTimeout(() => {
        isPlaying = false;
        updateButtonStates();
      }, 5000);
    }
  } catch (error) {
    appendLog(`Ошибка запуска: ${error.message}`, "error");
    showToast(`Ошибка запуска: ${error.message}`, "error");
    isPlaying = false;
    updateButtonStates();
  }
}
  async function loadSettings() {
    if (!isElectron || !electronAPI) return;
    try {
      const [settings, systemInfo, javaInfo] = await Promise.all([
        electronAPI.loadSettings(),
        getSystemInfo(),
        checkSystemJava(),
      ]);
      if (systemInfo && elements.maxMemoryInput) {
        const maxSlider = elements.maxMemoryInput;
        maxSlider.max = systemInfo.maxRecommended;
        const memValue =
          parseInt(settings?.maxMemory) || systemInfo.recommendedMemory;
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
      // Остальные настройки
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
  function updateMemoryPercentage() {
    const maxMemory = parseInt(elements.maxMemoryInput?.value || 4);
    const percentageEl = document.getElementById("memory-percentage");
    getSystemInfo().then((systemInfo) => {
      if (systemInfo && percentageEl) {
        const percentage = Math.round(
          (maxMemory / systemInfo.totalMemory) * 100
        );
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
  function updateJavaStatus(javaInfo) {
    const javaStatusEl = document.getElementById("java-status");
    if (javaStatusEl) {
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
  }
  function setupMemorySliders() {
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
            appendLog(
              `Минимальная память скорректирована до ${Math.max(
                1,
                value - 1
              )} GB`
            );
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
          showToast(
            "Минимальная память не может быть больше максимальной",
            "warning"
          );
          elements.minMemorySelect.value = `${Math.max(1, maxValue - 1)}`;
        }
      });
    }
  }
  async function saveSettings() {
  if (!isElectron || !electronAPI) return;
  const settings = {
    maxMemory: elements.maxMemoryInput
      ? `${elements.maxMemoryInput.value}G`
      : "4G",
    minMemory: elements.minMemorySelect
      ? `${elements.minMemorySelect.value}G`
      : "2G",
    javaPath: elements.javaPathInput
      ? elements.javaPathInput.value
      : "(Автоматически)",
    modpack: elements.versionSelect ? elements.versionSelect.value : "ULTRA",
    highPriority: document.getElementById("high-priority")?.checked || false,
    gcOptimization:
      document.getElementById("gc-optimization")?.checked || true,
    autoUpdates: document.getElementById("auto-updates")?.checked || true,
    closeLauncher:
      document.getElementById("close-launcher")?.checked || false,
  };
  try {
    await electronAPI.saveSettings(settings);
    appendLog("Настройки сохранены с новыми параметрами", "success");
    showToast("Настройки успешно сохранены!");
  } catch (error) {
    appendLog(`Ошибка сохранения настроек: ${error.message}`, "error");
    showToast(`Ошибка сохранения: ${error.message}`, "error");
  }
}
  async function getAppInfo() {
    if (!isElectron || !electronAPI) return;
    try {
      const version = await electronAPI.getAppVersion();
      appendLog(`Версия лаунчера: ${version}`);
      const versionElement = document.querySelector(".version-info");
      if (versionElement) {
        versionElement.textContent = `Лаунчер v${version}`;
      }
    } catch (error) {
      appendLog("Не удалось получить версию лаунчера", "warning");
    }
  }
  function setupJavaPathHandler() {
    if (elements.selectJavaPathBtn) {
      elements.selectJavaPathBtn.addEventListener("click", async () => {
        if (!isElectron || !electronAPI) {
          showToast("Функция доступна только в приложении", "error");
          return;
        }
        try {
          const result = await electronAPI.selectJavaPath();
          if (
            result.filePaths &&
            result.filePaths.length > 0 &&
            elements.javaPathInput
          ) {
            elements.javaPathInput.value = result.filePaths[0];
            appendLog(`Выбран путь к Java: ${result.filePaths[0]}`);
          }
        } catch (error) {
          appendLog(`Ошибка выбора Java: ${error.message}`, "error");
        }
      });
    }
  }
  async function resetSettings() {
    if (!confirm("Вы уверены, что хотите сбросить все настройки?")) {
      return;
    }
    const systemInfo = await getSystemInfo();
    const defaultSettings = {
      maxMemory: systemInfo ? `${systemInfo.recommendedMemory}G` : "4G",
      minMemory: "2G",
      javaPath: "(Автоматически)",
      modpack: "ULTRA",
      highPriority: false,
      gcOptimization: true,
      autoUpdates: true,
      closeLauncher: false,
    };
    try {
      if (isElectron && electronAPI) {
        await electronAPI.saveSettings(defaultSettings);
      }
      await loadSettings();
      showToast("Настройки сброшены к значениям по умолчанию", "success");
      appendLog("Настройки сброшены", "info");
    } catch (error) {
      showToast(`Ошибка сброса настроек: ${error.message}`, "error");
      appendLog(`Ошибка сброса настроек: ${error.message}`, "error");
    }
  }
  function setupExitHandler() {
    if (elements.exitBtn) {
      elements.exitBtn.addEventListener("click", async () => {
        if (isInstalling || isPlaying) {
          const shouldExit = confirm(
            "Операция в процессе. Вы уверены, что хотите выйти?"
          );
          if (!shouldExit) return;
        }
        appendLog("Выход из приложения...");
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
      elements.loginButton.addEventListener("click", handleLogin);
    }
    if (elements.installBtn) {
      elements.installBtn.addEventListener("click", handleInstall);
    }
    if (elements.playBtn) {
      elements.playBtn.addEventListener("click", handlePlay);
    }
    if (elements.checkStatusBtn) {
      elements.checkStatusBtn.addEventListener("click", checkClientStatus);
    }
    if (elements.resetBtn) {
      elements.resetBtn.addEventListener("click", resetSettings);
    }
    setupJavaPathHandler();
    setupExitHandler();
    setupMemorySliders();
    setupClearSavedAccountHandler();
      setupProfileEventListeners();
    elements.menuItems.forEach((item) => {
      item.addEventListener("click", () => {
        const tab = item.dataset.tab;
        if (tab) switchTab(tab);
      });
    });
    // Кнопка проверки обновлений
    const checkUpdatesBtn = document.getElementById("check-updates-manual");
    if (checkUpdatesBtn) {
      checkUpdatesBtn.addEventListener("click", checkForUpdatesManually);
    }
    // Обработчик изменения памяти для процентов
    if (elements.maxMemoryInput) {
      elements.maxMemoryInput.addEventListener("input", () => {
        const value = parseInt(elements.maxMemoryInput.value);
        if (elements.maxMemoryValue) {
          elements.maxMemoryValue.textContent = `${value} GB`;
        }
        updateMemoryPercentage();
        // Автоматически корректируем минимальную память
        if (elements.minMemorySelect) {
          const minValue = parseInt(elements.minMemorySelect.value);
          if (minValue >= value) {
            elements.minMemorySelect.value = `${Math.max(1, value - 1)}G`;
            appendLog(`Максимальная память: ${value} GB`);
          }
        }
      });
    }
    const checkboxes = [
      "high-priority",
      "gc-optimization",
      "auto-updates",
      "close-launcher",
    ];
    checkboxes.forEach((id) => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.addEventListener("change", () => {
          const label = checkbox.nextElementSibling?.textContent || id;
          appendLog(`${label}: ${checkbox.checked ? "включено" : "отключено"}`);
        });
      }
    });
    if (elements.saveSettingsBtn) {
      elements.saveSettingsBtn.addEventListener("click", saveSettings);
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "F5") {
        event.preventDefault();
        if (isAuthenticated) {
          checkClientStatus();
          showToast("Статус обновлен", "info");
        }
      }
      if (
        event.key === "Enter" &&
        elements.loginModal.style.display !== "none"
      ) {
        handleLogin();
      }
    });
    window.addEventListener("beforeunload", (event) => {
      if (isInstalling || isPlaying) {
        event.preventDefault();
        event.returnValue = "";
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
        appendLog(
          `Статус обновлен: ${
            isClientInstalled ? "установлен" : "не установлен"
          }`
        );
        updateButtonStates();
      });
    }
  }
  async function initializeSettings() {
    await loadSettings();
    updateMemoryPercentage();
    setupMemorySliders();
    appendLog("Настройки инициализированы", "success");
  }
  async function initialize() {
    appendLog("=== SHAMPUNEUM LAUNCHER ===");
    appendLog(
      `Запущен в режиме: ${
        isElectron ? "Electron приложение" : "Браузер (демо)"
      }`
    );
    if (isElectron) {
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
  document.addEventListener("DOMContentLoaded", async () => {
    setupEventListeners();
    setupUpdateHandlers();
    setTimeout(async () => {
      const loader = document.querySelector(".loader");
      if (loader) loader.style.display = "none";
      if (!isElectron) {
        appendLog("Запущен в браузере - демо-режим");
      }
      await initialize();
    }, 1500);
  });
  if (typeof window !== "undefined") {
    window.launcherAPI = {
      showToast,
      appendLog,
      checkClientStatus,
      isAuthenticated: () => isAuthenticated,
      getCurrentUser: () => currentUser,
      getClientStatus: () => clientStatus,
    };
  }
})();