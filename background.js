// Background script для обработки OAuth запросов
// chrome.identity доступен только в background script или popup

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getAuthToken') {
        // Получаем OAuth токен через chrome.identity
        chrome.identity.getAuthToken(
            {
                interactive: true,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            },
            (token) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ error: chrome.runtime.lastError.message });
                } else if (token) {
                    sendResponse({ token: token });
                } else {
                    sendResponse({ error: 'Не удалось получить токен' });
                }
            }
        );
        return true; // Асинхронный ответ
    }
    
    if (request.action === 'removeAuthToken') {
        if (request.token) {
            chrome.identity.removeCachedAuthToken(
                { token: request.token },
                () => {
                    sendResponse({ success: true });
                }
            );
        } else {
            sendResponse({ error: 'Токен не указан' });
        }
        return true;
    }
});
