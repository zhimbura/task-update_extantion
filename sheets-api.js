// Модуль для работы с Google Sheets через API
// Использует OAuth токен для доступа к Google Sheets API v4

/**
 * Получает ID таблицы из URL
 * @param {string} url - URL страницы Google Sheets
 * @returns {string|null} ID таблицы
 */
function getSpreadsheetIdFromUrl(url) {
    if (!url) {
        url = window.location.href;
    }
    
    // Формат: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}

/**
 * Получает OAuth токен через chrome.identity
 * Используется из content script, поэтому обращаемся к background через runtime.sendMessage
 */
async function getAuthToken() {
    return new Promise((resolve, reject) => {
        // Всегда используем background script для получения токена
        // chrome.identity доступен только в background или popup, не в content script
        chrome.runtime.sendMessage(
            { action: 'getAuthToken' },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (response && response.token) {
                    resolve(response.token);
                } else if (response && response.error) {
                    reject(new Error(response.error));
                } else {
                    reject(new Error('Не удалось получить токен авторизации'));
                }
            }
        );
    });
}

/**
 * Класс для работы с Google Sheets через API
 */
class GoogleSheetsAPI {
    constructor(spreadsheetId, authToken) {
        this.spreadsheetId = spreadsheetId;
        this.authToken = authToken;
        this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    }

    /**
     * Создает экземпляр из текущей страницы
     */
    static async fromCurrentPage() {
        const spreadsheetId = getSpreadsheetIdFromUrl();
        if (!spreadsheetId) {
            throw new Error('Не удалось определить ID таблицы из URL');
        }
        
        const authToken = await getAuthToken();
        return new GoogleSheetsAPI(spreadsheetId, authToken);
    }

    /**
     * Выполняет запрос к Google Sheets API
     */
    async apiRequest(endpoint, options = {}) {
        const url = `${this.baseUrl}/${this.spreadsheetId}${endpoint}`;
        
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.authToken}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Sheets API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return response.json();
    }

    /**
     * Получает данные из диапазона ячеек
     * @param {string} range - диапазон в формате "Sheet1!A1:B10" или "A1:B10"
     * @returns {Promise<Array<Array<string>>>} массив строк, каждая строка - массив значений ячеек
     */
    async getRange(range) {
        const response = await this.apiRequest(`/values/${encodeURIComponent(range)}`);
        return response.values || [];
    }

    /**
     * Обновляет значения в диапазоне ячеек
     * @param {string} range - диапазон в формате "Sheet1!A1:B10"
     * @param {Array<Array<string>>} values - массив строк, каждая строка - массив значений
     * @returns {Promise<Object>} результат обновления
     */
    async updateRange(range, values) {
        const response = await this.apiRequest(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            body: JSON.stringify({
                values: values
            })
        });
        return response;
    }

    /**
     * Получает данные из столбцов для указанного диапазона строк
     * @param {string} taskColumn - столбец с задачами (например, "A")
     * @param {string} statusColumn - столбец со статусами (например, "B")
     * @param {number} startRow - начальная строка
     * @param {number} endRow - конечная строка
     * @param {string} sheetName - имя листа (по умолчанию первое)
     * @returns {Promise<Array>} массив объектов {row, taskId, oldStatus}
     */
    async getColumnData(taskColumn, statusColumn, startRow, endRow, sheetName = null) {
        // Получаем имя листа, если не указано
        if (!sheetName) {
            const spreadsheet = await this.apiRequest('');
            sheetName = spreadsheet.sheets[0].properties.title;
        }

        // Формируем диапазон для чтения
        const range = `${sheetName}!${taskColumn}${startRow}:${statusColumn}${endRow}`;
        
        const values = await this.getRange(range);
        
        const data = [];
        for (let i = 0; i < values.length; i++) {
            const row = startRow + i;
            const taskValue = values[i][0] || '';
            const statusValue = values[i][1] || '';
            
            // Извлекаем ID задачи из текста
            const taskId = extractTaskId(taskValue);
            
            data.push({
                row: row,
                taskId: taskId,
                oldStatus: statusValue.trim(),
                taskValue: taskValue,
                statusValue: statusValue
            });
        }
        
        return data;
    }

    /**
     * Обновляет значения в столбце статусов
     * @param {string} statusColumn - столбец со статусами (например, "B")
     * @param {Object} updates - объект {row: status} с обновлениями
     * @param {string} sheetName - имя листа
     * @returns {Promise<Object>} результат обновления
     */
    async updateStatusColumn(statusColumn, updates, sheetName = null) {
        // Получаем имя листа, если не указано
        if (!sheetName) {
            const spreadsheet = await this.apiRequest('');
            sheetName = spreadsheet.sheets[0].properties.title;
        }

        const rows = Object.keys(updates).map(Number).sort((a, b) => a - b);
        
        if (rows.length === 0) {
            return { updatedCells: 0 };
        }

        // Используем batchUpdate для обновления только нужных ячеек
        const data = rows.map(row => ({
            range: `${sheetName}!${statusColumn}${row}`,
            values: [[updates[row]]]
        }));

        // Используем batchUpdate API для более эффективного обновления
        const url = `${this.baseUrl}/${this.spreadsheetId}/values:batchUpdate`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                valueInputOption: 'USER_ENTERED',
                data: data
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Sheets API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json();
    }
}

/**
 * Извлекает ID задачи из текста
 */
function extractTaskId(text) {
    if (!text) return null;
    const match = text.toString().match(/([A-Z]+-\d+)/);
    return match ? match[1] : null;
}

// Экспорт для использования в других скриптах
// Делаем класс доступным глобально для content script
if (typeof window !== 'undefined') {
    window.GoogleSheetsAPI = GoogleSheetsAPI;
    window.getSpreadsheetIdFromUrl = getSpreadsheetIdFromUrl;
    window.extractTaskId = extractTaskId;
}

// Также экспортируем для Node.js (если используется)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GoogleSheetsAPI, getSpreadsheetIdFromUrl, extractTaskId };
}
