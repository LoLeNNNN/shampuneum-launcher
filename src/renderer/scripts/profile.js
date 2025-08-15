import { state } from './state.js';
import { appendLog, showToast } from './logs.js';

// Сброс превью скина
export function resetSkinPreview() {
    const skinUpload = document.getElementById("skin-upload");
    const previewContainer = document.getElementById("preview-container");
    const applySkinBtn = document.getElementById("apply-skin");
    
    if (skinUpload) skinUpload.value = "";
    if (previewContainer) previewContainer.style.display = "none";
    if (applySkinBtn) applySkinBtn.disabled = true;
    
    if (state.currentSkinPreview) {
        URL.revokeObjectURL(state.currentSkinPreview);
    }
    
    state.currentSkinPreview = null;
    state.skinPreviewBlob = null;
    showToast("Превью скина сброшено", "info");
}

// Обновление информации профиля
export function updateProfileInfo(user) {
    const profileUsername = document.getElementById("profile-username");
    const profileAccess = document.getElementById("profile-access");
    
    if (profileUsername) {
        profileUsername.textContent = user.username || "Пользователь";
    }
    
    if (profileAccess) {
        profileAccess.textContent = `Проходка: ${user.access || "навсегда"}`;
    }
}

// Настройка загрузки скина
export function setupSkinUpload() {
    const skinUpload = document.getElementById("skin-upload");
    if (skinUpload) {
        skinUpload.addEventListener("change", handleSkinUpload);
    }
}

// Обработка загрузки скина
async function handleSkinUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
        showToast("Пожалуйста, выберите изображение", "error");
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast("Файл слишком большой. Максимум 5MB", "error");
        return;
    }
    
    try {
        const imageUrl = URL.createObjectURL(file);
        await validateAndPreviewSkin(imageUrl, file);
        appendLog(`Загружен файл скина: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, "info");
    } catch (error) {
        showToast(`Ошибка загрузки скина: ${error.message}`, "error");
        appendLog(`Ошибка загрузки скина: ${error.message}`, "error");
    }
}

// Валидация и превью скина
async function validateAndPreviewSkin(imageUrl, file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            const validSizes = [
                { width: 64, height: 64 },
                { width: 64, height: 32 }
            ];
            
            const isValidSize = validSizes.some(
                size => this.width === size.width && this.height === size.height
            );
            
            if (!isValidSize) {
                showToast("Неверный размер скина. Используйте 64x64 или 64x32 пикселя", "warning");
            }
            
            showSkinPreview(imageUrl, file);
            resolve();
        };
        
        img.onerror = function() {
            reject(new Error("Не удалось загрузить изображение"));
        };
        
        img.src = imageUrl;
    });
}

// Показать превью скина
function showSkinPreview(imageUrl, file) {
    const previewContainer = document.getElementById("preview-container");
    const skinPreview = document.getElementById("skin-preview");
    const previewInfo = document.getElementById("preview-info");
    
    if (skinPreview) {
        skinPreview.src = imageUrl;
        skinPreview.style.imageRendering = "pixelated";
    }
    
    if (previewInfo) {
        previewInfo.innerHTML = `
            <div class="preview-details">
                <span><strong>Файл:</strong> ${file.name}</span>
                <span><strong>Размер:</strong> ${(file.size / 1024).toFixed(1)} KB</span>
                <span><strong>Тип:</strong> ${file.type}</span>
            </div>
        `;
    }
    
    if (previewContainer) {
        previewContainer.style.display = "block";
    }
    
    state.currentSkinPreview = imageUrl;
    state.skinPreviewBlob = file;
    
    const applySkinBtn = document.getElementById("apply-skin");
    if (applySkinBtn) {
        applySkinBtn.disabled = false;
    }
}

// Применить скин
export function applySkinPreview() {
    if (!state.currentSkinPreview) {
        showToast("Сначала выберите скин", "warning");
        return;
    }
    
    showToast("Загрузка скина пока не работает - функция в разработке", "info");
    appendLog("Попытка применения скина - функция в разработке", "info");
}