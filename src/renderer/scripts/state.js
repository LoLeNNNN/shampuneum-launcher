// Глобальное состояние приложения
const state = {
    isElectron: typeof window !== "undefined" && window.electronAPI,
    electronAPI: null,
    isInstalling: false,
    isPlaying: false,
    isClientInstalled: false,
    clientStatus: null,
    currentTab: "home",
    logs: [],
    updateAvailable: false,
    isAuthenticated: false,
    currentUser: null,
    currentUpdateInfo: null,
    isUpdating: false,
    currentSkinPreview: null,
    skinPreviewBlob: null
};

if (state.isElectron) {
    state.electronAPI = window.electronAPI;
}

// DOM элементы
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
    openGameDirBtn: document.getElementById("open-game-dir")
};

export { state, elements };