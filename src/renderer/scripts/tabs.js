import { elements } from './state.js';

// Переключение вкладок
export function switchTab(tab) {
    elements.tabContents.forEach(content => {
        content.classList.remove("active");
    });
    
    const tabContent = document.getElementById(`${tab}-tab`);
    if (tabContent) tabContent.classList.add("active");
    
    elements.menuItems.forEach(item => {
        item.classList.remove("active");
        if (item.dataset.tab === tab) {
            item.classList.add("active");
        }
    });
}

// Настройка обработчиков вкладок
export function setupTabHandlers() {
    elements.menuItems.forEach(item => {
        item.addEventListener("click", () => {
            const tab = item.dataset.tab;
            if (tab) switchTab(tab);
        });
    });
}