// Модуль для OAuth авторизации через chrome.identity
// Получает OAuth токен от Google пользователя в браузере

/**
 * Получает OAuth токен для доступа к Google Sheets API
 * @param {boolean} interactive - показывать ли диалог авторизации, если токен не найден
 * @returns {Promise<string>} OAuth токен
 */
async function getGoogleAuthToken(interactive = true) {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken(
            {
                interactive: interactive,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            },
            (token) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (!token) {
                    reject(new Error('Не удалось получить токен авторизации'));
                    return;
                }
                resolve(token);
            }
        );
    });
}

/**
 * Удаляет токен из кэша (для повторной авторизации)
 * @param {string} token - токен для удаления
 */
async function removeAuthToken(token) {
    return new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token }, () => {
            resolve();
        });
    });
}

/**
 * Получает новый токен (удаляет старый и получает новый)
 * @returns {Promise<string>} новый OAuth токен
 */
async function refreshAuthToken() {
    try {
        // Пытаемся получить текущий токен
        const currentToken = await getGoogleAuthToken(false);
        if (currentToken) {
            // Удаляем старый токен
            await removeAuthToken(currentToken);
        }
    } catch (error) {
        // Игнорируем ошибки при удалении
    }
    
    // Получаем новый токен
    return getGoogleAuthToken(true);
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getGoogleAuthToken, removeAuthToken, refreshAuthToken };
}
