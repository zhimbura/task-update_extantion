// Колонки таблицы по умолчанию (поля YT)
const DEFAULT_TABLE_COLUMNS = [
    { id: 'Stage3', label: 'Статус' },
    { id: 'id', label: 'Задача' },
    { id: 'summary', label: 'Описание' }
];

// Система логирования
let logs = [];

function addLog(message, type = 'info', details = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        message,
        type,
        details
    };
    logs.push(logEntry);
    
    // Сохраняем последние 100 логов
    const maxLogs = 100;
    if (logs.length > maxLogs) {
        logs = logs.slice(-maxLogs);
    }
    
    updateLogsDisplay();
    
    // Также выводим в консоль для отладки
    const consoleMethod = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
    const timeStr = new Date(timestamp).toLocaleTimeString();
    if (details && typeof details === 'object') {
        console[consoleMethod](`[${timeStr}] ${message}`, details);
    } else if (details) {
        console[consoleMethod](`[${timeStr}] ${message}`, details);
    } else {
        console[consoleMethod](`[${timeStr}] ${message}`);
    }
}

function updateLogsDisplay() {
    const logsContent = document.getElementById('logsContent');
    if (!logsContent) return;
    
    logsContent.innerHTML = logs.map(log => {
        const timeStr = new Date(log.timestamp).toLocaleTimeString('ru-RU');
        const detailsStr = log.details ? '\n' + JSON.stringify(log.details, null, 2) : '';
        return `<div class="log-entry ${log.type}">
            <span class="log-timestamp">[${timeStr}]</span>
            ${log.message}${detailsStr}
        </div>`;
    }).join('');
    
    // Прокручиваем вниз
    logsContent.scrollTop = logsContent.scrollHeight;
}

// Обработка сообщений от content script (для логов и OAuth)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'log') {
        addLog(request.message, request.type || 'info', request.details);
        sendResponse({ success: true });
        return true;
    }
    
    // OAuth токены теперь обрабатываются в background.js
    // popup может также использовать chrome.identity напрямую, но для единообразия
    // лучше использовать background script
});

// Загрузка сохраненных настроек
document.addEventListener('DOMContentLoaded', async () => {
    // Добавляем обработчики для кнопок
    document.getElementById('saveLogs').addEventListener('click', saveLogsToFile);
    
    const settings = await chrome.storage.local.get([
        'youtrackHost',
        'youtrackToken',
        'taskList',
        'resultsData',
        'tableColumns'
    ]);

    if (settings.youtrackHost) {
        document.getElementById('youtrackHost').value = settings.youtrackHost;
    }
    if (settings.youtrackToken) {
        document.getElementById('youtrackToken').value = settings.youtrackToken;
    }
    if (settings.taskList) {
        document.getElementById('taskList').value = settings.taskList;
    }
    const tableColumns = Array.isArray(settings.tableColumns) && settings.tableColumns.length > 0
        ? settings.tableColumns
        : DEFAULT_TABLE_COLUMNS;
    renderTableColumnsList(tableColumns);

    if (settings.resultsData && settings.resultsData.length > 0) {
        displayResults(settings.resultsData, tableColumns);
        document.getElementById('resultsSection').style.display = 'block';
    }
    
    // Восстанавливаем позицию скролла
    restoreScrollPosition();
    
    // Добавляем начальный лог
    addLog('Расширение загружено', 'info');
    
    // Обработчики для переключения между разделами
    document.getElementById('settingsButton').addEventListener('click', () => {
        showSettingsView();
    });
    
    document.getElementById('backToMain').addEventListener('click', () => {
        showMainView();
    });
    
    // Сохранение позиции скролла при прокрутке
    let scrollSaveTimeout = null;
    document.body.addEventListener('scroll', () => {
        clearTimeout(scrollSaveTimeout);
        scrollSaveTimeout = setTimeout(() => {
            saveScrollPosition();
        }, 300); // Сохраняем через 300ms после остановки скролла
    });
    
    // Сохранение позиции скролла и результатов при закрытии попапа
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            saveScrollPosition();
            saveCurrentResults();
        }
    });
    
    // Сохранение при уходе фокуса (fallback)
    window.addEventListener('blur', () => {
        saveScrollPosition();
        saveCurrentResults();
    });
});

// Сохранение текущих результатов из таблицы
async function saveCurrentResults() {
    try {
        // Проверяем, не скрыта ли секция результатов (если скрыта, значит была очистка)
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection && resultsSection.style.display === 'none') {
            return; // Не сохраняем, если секция скрыта
        }
        
        const results = getCurrentResults();
        if (results.length > 0) {
            await saveResults(results);
        } else {
            // Если результатов нет, удаляем сохраненные данные
            await chrome.storage.local.remove(['resultsData']);
        }
    } catch (error) {
        console.warn('Не удалось сохранить текущие результаты:', error);
    }
}

// Сохранение позиции скролла
async function saveScrollPosition() {
    try {
        const scrollTop = document.body.scrollTop || document.documentElement.scrollTop || 0;
        const scrollHeight = document.body.scrollHeight || document.documentElement.scrollHeight || 0;
        
        await chrome.storage.local.set({
            scrollPosition: scrollTop,
            scrollHeight: scrollHeight
        });
    } catch (error) {
        // Тихая ошибка, не логируем
        console.warn('Не удалось сохранить позицию скролла:', error);
    }
}

// Восстановление позиции скролла (только при загрузке попапа)
async function restoreScrollPosition() {
    try {
        const result = await chrome.storage.local.get(['scrollPosition', 'scrollHeight']);
        
        if (result.scrollPosition !== undefined) {
            // Ждем, пока контент загрузится
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const currentScrollHeight = document.body.scrollHeight || document.documentElement.scrollHeight || 0;
            const savedScrollHeight = result.scrollHeight || 0;
            const savedScrollPosition = result.scrollPosition || 0;
            
            // Fallback: если высота контента изменилась (стала меньше или больше), скроллим в начало
            if (currentScrollHeight !== savedScrollHeight || savedScrollPosition > currentScrollHeight - 100) {
                document.body.scrollTop = 0;
                document.documentElement.scrollTop = 0;
                // Очищаем сохраненную позицию, если высота изменилась
                await chrome.storage.local.remove(['scrollPosition', 'scrollHeight']);
            } else {
                // Восстанавливаем позицию только если высота не изменилась
                document.body.scrollTop = savedScrollPosition;
                document.documentElement.scrollTop = savedScrollPosition;
            }
        }
    } catch (error) {
        // Тихая ошибка, не логируем
        console.warn('Не удалось восстановить позицию скролла:', error);
    }
}

// Рендер списка колонок в настройках
function renderTableColumnsList(columns) {
    const container = document.getElementById('tableColumnsList');
    if (!container) return;
    container.innerHTML = '';
    (columns || DEFAULT_TABLE_COLUMNS).forEach((col, index) => {
        const row = document.createElement('div');
        row.className = 'column-row';
        row.innerHTML = `
            <input type="text" class="col-field" data-index="${index}" placeholder="Поле (id, summary, Stage3...)" value="${escapeHtml(col.id)}" title="Поле YouTrack: id, summary или имя кастомного поля">
            <input type="text" class="col-label" data-index="${index}" placeholder="Подпись колонки" value="${escapeHtml(col.label)}">
            <button type="button" class="btn-remove-col" data-index="${index}" title="Удалить колонку">✕</button>
        `;
        container.appendChild(row);
    });
    // Обработчики
    container.querySelectorAll('.col-field, .col-label').forEach(input => {
        input.addEventListener('input', () => syncTableColumnsFromDOM());
    });
    container.querySelectorAll('.btn-remove-col').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'), 10);
            const cols = getTableColumnsFromDOM();
            if (cols.length <= 1) return;
            cols.splice(index, 1);
            saveTableColumns(cols);
            renderTableColumnsList(cols);
        });
    });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getTableColumnsFromDOM() {
    const rows = document.querySelectorAll('#tableColumnsList .column-row');
    const cols = [];
    rows.forEach(row => {
        const fieldInput = row.querySelector('.col-field');
        const labelInput = row.querySelector('.col-label');
        if (fieldInput && labelInput) {
            const id = (fieldInput.value || '').trim() || 'Field';
            cols.push({ id, label: (labelInput.value || '').trim() || id });
        }
    });
    return cols.length > 0 ? cols : DEFAULT_TABLE_COLUMNS;
}

function syncTableColumnsFromDOM() {
    const cols = getTableColumnsFromDOM();
    saveTableColumns(cols);
}

async function saveTableColumns(columns) {
    await chrome.storage.local.set({ tableColumns: columns });
}

// Получить текущие колонки из storage (для использования при загрузке статусов и отображении)
async function getTableColumns() {
    const st = await chrome.storage.local.get(['tableColumns']);
    return Array.isArray(st.tableColumns) && st.tableColumns.length > 0 ? st.tableColumns : DEFAULT_TABLE_COLUMNS;
}

// Переключение на раздел настроек
function showSettingsView() {
    document.getElementById('mainView').style.display = 'none';
    document.getElementById('settingsView').style.display = 'block';
    getTableColumns().then(renderTableColumnsList);
}

// Переключение на основной раздел
function showMainView() {
    document.getElementById('settingsView').style.display = 'none';
    document.getElementById('mainView').style.display = 'block';
}

// Функция сохранения настроек
async function saveSettings(showNotification = false) {
    const host = document.getElementById('youtrackHost').value.trim();
    const token = document.getElementById('youtrackToken').value.trim();
    const taskList = document.getElementById('taskList').value.trim();

    // Сохраняем настройки подключения и список задач
    await chrome.storage.local.set({
        youtrackHost: host,
        youtrackToken: token,
        taskList: taskList
    });

    if (showNotification) {
        showMessage('Настройки сохранены!', 'success');
    }
}

// Сохранение результатов таблицы
async function saveResults(results) {
    try {
        await chrome.storage.local.set({ resultsData: results });
    } catch (error) {
        console.warn('Не удалось сохранить результаты:', error);
    }
}

// Получение текущих результатов из таблицы по колонкам
function getCurrentResults() {
    const tableBody = document.getElementById('resultsTableBody');
    const theadRow = document.getElementById('resultsTableHead')?.querySelector('tr');
    if (!tableBody || !theadRow) return [];

    const results = [];
    tableBody.querySelectorAll('tr').forEach((row) => {
        const taskId = row.getAttribute('data-task-id');
        if (!taskId) return;
        const cells = row.querySelectorAll('td');
        const item = { taskId };
        let hasError = false;
        let errorSummary = '';
        cells.forEach((cell, i) => {
            const colId = cell.getAttribute('data-col-id');
            if (!colId) return;
            const retryBtn = cell.querySelector('.btn-small');
            if (retryBtn) {
                hasError = true;
                const span = cell.querySelector('span');
                errorSummary = span ? span.textContent.trim() : cell.textContent.trim();
            }
            item[colId] = cell.textContent.trim().replace(/\s*Повторить\s*$/, '').trim();
        });
        item.isLoading = (cells[0] && cells[0].textContent.trim() === 'Загрузка...');
        item.hasError = hasError || (cells[0] && cells[0].textContent.trim() === 'Ошибка');
        item.error = item.hasError ? new Error(errorSummary || '') : null;
        results.push(item);
    });
    return results;
}

// Очистка данных
async function clearData() {
    document.getElementById('taskList').value = '';
    
    // Очищаем таблицу результатов
    const tableBody = document.getElementById('resultsTableBody');
    if (tableBody) {
        tableBody.innerHTML = '';
    }
    
    // Скрываем секцию результатов
    document.getElementById('resultsSection').style.display = 'none';
    
    // Удаляем все сохраненные данные
    await chrome.storage.local.remove(['taskList', 'resultsData', 'scrollPosition', 'scrollHeight']);
    
    // Сбрасываем скролл в начало
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    
    showMessage('Данные очищены', 'info');
}

// Debounce функция для автосохранения
let saveTimeout = null;
function autoSave(delay = 500) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveSettings(false); // Сохраняем без уведомления
        showAutoSaveIndicator(); // Показываем индикатор автосохранения
    }, delay);
}

// Показ индикатора автосохранения
function showAutoSaveIndicator() {
    const indicator = document.getElementById('autoSaveIndicator');
    indicator.style.display = 'block';
    indicator.style.animation = 'none';
    
    // Перезапускаем анимацию
    setTimeout(() => {
        indicator.style.animation = 'fadeInOut 2s ease-in-out';
    }, 10);
    
    // Скрываем через 2 секунды
    setTimeout(() => {
        indicator.style.display = 'none';
    }, 2000);
}

// Сохранение настроек по кнопке (с уведомлением)
document.getElementById('saveSettings').addEventListener('click', async () => {
    const host = document.getElementById('youtrackHost').value.trim();
    const token = document.getElementById('youtrackToken').value.trim();

    if (!host || !token) {
        showMessage('Пожалуйста, заполните Host и Token', 'error');
        return;
    }

    await saveSettings(true);
    // Возвращаемся на основной экран после сохранения
    setTimeout(() => {
        showMainView();
    }, 1000);
});

// Автосохранение при изменении полей
document.getElementById('youtrackHost').addEventListener('input', () => {
    autoSave();
    // Показываем индикатор автосохранения в разделе настроек
    const indicator = document.getElementById('autoSaveIndicatorSettings');
    if (indicator) {
        indicator.style.display = 'block';
        indicator.style.animation = 'none';
        setTimeout(() => {
            indicator.style.animation = 'fadeInOut 2s ease-in-out';
        }, 10);
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 2000);
    }
});
document.getElementById('youtrackToken').addEventListener('input', () => {
    autoSave();
    // Показываем индикатор автосохранения в разделе настроек
    const indicator = document.getElementById('autoSaveIndicatorSettings');
    if (indicator) {
        indicator.style.display = 'block';
        indicator.style.animation = 'none';
        setTimeout(() => {
            indicator.style.animation = 'fadeInOut 2s ease-in-out';
        }, 10);
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 2000);
    }
});
document.getElementById('taskList').addEventListener('input', () => autoSave());

document.getElementById('addTableColumn').addEventListener('click', () => {
    const cols = getTableColumnsFromDOM();
    cols.push({ id: 'Field', label: 'Новая колонка' });
    saveTableColumns(cols);
    renderTableColumnsList(cols);
});

// Кнопка очистки данных
document.getElementById('clearData').addEventListener('click', async () => {
    await clearData();
});

// Парсинг списка задач из текста
function parseTaskList(text) {
    if (!text || !text.trim()) {
        return [];
    }
    
    // Разбиваем по строкам и запятым
    const lines = text.split(/[\n,;]+/);
    const tasks = [];
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Ищем ID задачи в формате XXX-123
        const match = trimmed.match(/([A-Z]+-\d+)/i);
        if (match) {
            tasks.push(match[1].toUpperCase());
        }
    }
    
    // Убираем дубликаты, сохраняя порядок
    const uniqueTasks = [];
    const seen = new Set();
    for (const task of tasks) {
        if (!seen.has(task)) {
            seen.add(task);
            uniqueTasks.push(task);
        }
    }
    
    return uniqueTasks;
}

// Получение статусов
document.getElementById('loadStatuses').addEventListener('click', async () => {
    const settings = await chrome.storage.local.get([
        'youtrackHost',
        'youtrackToken'
    ]);

    if (!settings.youtrackHost || !settings.youtrackToken) {
        showMessage('Сначала сохраните настройки (Host и Token)', 'error');
        return;
    }

    const taskListText = document.getElementById('taskList').value.trim();
    if (!taskListText) {
        showMessage('Введите список задач', 'error');
        return;
    }

    const tasks = parseTaskList(taskListText);
    if (tasks.length === 0) {
        showMessage('Не найдено ни одной задачи в формате XXX-123', 'error');
        return;
    }

    const tableColumns = await getTableColumns();
    showMessage(`Загрузка полей для ${tasks.length} задач...`, 'info');
    document.getElementById('loadStatuses').disabled = true;

    // Начальные результаты: по одной ячейке "Загрузка..." на каждую колонку
    const results = tasks.map(taskId => {
        const row = { taskId, isLoading: true, hasError: false, error: null };
        tableColumns.forEach(col => { row[col.id] = 'Загрузка...'; });
        return row;
    });

    displayResults(results, tableColumns);
    document.getElementById('resultsSection').style.display = 'block';

    let completedCount = 0;
    const updatePromises = tasks.map(async (taskId, index) => {
        try {
            addLog(`Запрос данных для ${taskId}...`, 'info');
            const taskData = await fetchTaskStatus(taskId, settings.youtrackHost, settings.youtrackToken);
            const row = apiResponseToRow(taskId, taskData, tableColumns);
            results[index] = { ...row, isLoading: false, hasError: false, error: null };
            addLog(`${taskId}: получены поля`, 'success');
            updateTableRow(index, results[index], tableColumns);
            completedCount++;
            await saveResults(results);
            if (completedCount === tasks.length) {
                showMessage(`Загружено ${completedCount} задач`, 'success');
                document.getElementById('loadStatuses').disabled = false;
            }
        } catch (error) {
            addLog(`Ошибка для ${taskId}: ${error.message}`, 'error', { taskId, error: error.toString() });
            const row = { taskId };
            tableColumns.forEach(col => {
                row[col.id] = col.id === 'summary' ? error.message.substring(0, 50) : (col.id === 'id' ? taskId : 'Ошибка');
            });
            results[index] = { ...row, isLoading: false, hasError: true, error };
            updateTableRow(index, results[index], tableColumns);
            completedCount++;
            await saveResults(results);
            if (completedCount === tasks.length) {
                const errorCount = results.filter(r => r.hasError).length;
                const successCount = completedCount - errorCount;
                showMessage(`Загружено ${successCount} из ${completedCount}. Ошибок: ${errorCount}`, errorCount > 0 ? 'warning' : 'success');
                document.getElementById('loadStatuses').disabled = false;
            }
        }
    });

    // Ждем завершения всех запросов
    await Promise.all(updatePromises);
});

// Запрос полей задачи из YouTrack API (id, summary, все customFields по имени)
async function fetchTaskStatus(taskId, host, token) {
    const baseHost = (host || '').trim().replace(/\/+$/, '');
    const url = `${baseHost}/api/issues/${taskId}?fields=id,summary,customFields(name,value(name))`;
    
    addLog(`Запрос к API: ${url}`, 'info');
    
    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Accept': 'application/json'
            }
        });
    } catch (error) {
        const errorDetails = {
            taskId,
            error: error.message,
            errorType: error.name || 'NetworkError',
            errorString: error.toString(),
            url,
            host,
            timestamp: new Date().toISOString()
        };
        addLog(`Ошибка сети при запросе ${taskId}: ${error.message}`, 'error', errorDetails);
        throw new Error(`Ошибка сети: ${error.message}`);
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Не удалось прочитать ответ');
        const errorDetails = {
            taskId,
            status: response.status,
            statusText: response.statusText,
            responseText: errorText.substring(0, 500),
            url,
            host,
            timestamp: new Date().toISOString()
        };
        addLog(`HTTP ошибка для ${taskId}: ${response.status} ${response.statusText}`, 'error', errorDetails);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    let json;
    try {
        json = await response.json();
    } catch (error) {
        addLog(`Ошибка парсинга JSON для ${taskId}: ${error.message}`, 'error', {
            taskId,
            error: error.toString()
        });
        throw new Error(`Ошибка парсинга ответа: ${error.message}`);
    }

    const summary = json.summary || 'Нет описания';
    const customFields = {};
    if (Array.isArray(json.customFields)) {
        json.customFields.forEach(f => {
            if (f.name && f.value && f.value.name) customFields[f.name] = f.value.name;
        });
    }
    return {
        id: json.id || taskId,
        summary,
        customFields
    };
}

// Преобразовать ответ API в объект строки по колонкам
function apiResponseToRow(taskId, apiData, columns) {
    const row = { taskId };
    columns.forEach(col => {
        if (col.id === 'id') row[col.id] = apiData.id || taskId;
        else if (col.id === 'summary') row[col.id] = apiData.summary || '';
        else row[col.id] = (apiData.customFields && apiData.customFields[col.id]) || '';
    });
    return row;
}

// Нормализация старых результатов (status/summary) в формат по колонкам
function normalizeResultForColumns(item, columns) {
    const out = { taskId: item.taskId, isLoading: item.isLoading, hasError: item.hasError, error: item.error };
    columns.forEach(col => {
        if (item[col.id] !== undefined) out[col.id] = item[col.id];
        else if (col.id === 'Stage3' && item.status !== undefined) out[col.id] = item.status;
        else if (col.id === 'summary') out[col.id] = item.summary != null ? item.summary : '';
        else if (col.id === 'id') out[col.id] = item.taskId || '';
        else out[col.id] = '';
    });
    return out;
}

// Отображение результатов в таблице
function displayResults(results, columnsArg) {
    const tableColumns = columnsArg || DEFAULT_TABLE_COLUMNS;
    const theadRow = document.getElementById('resultsTableHead')?.querySelector('tr');
    const tableBody = document.getElementById('resultsTableBody');
    if (!theadRow || !tableBody) return;

    theadRow.innerHTML = '';
    tableColumns.forEach((col, colIndex) => {
        const th = document.createElement('th');
        const wrap = document.createElement('span');
        wrap.className = 'th-wrap';
        wrap.innerHTML = `<span>${escapeHtml(col.label)}</span><button type="button" class="btn-copy-col" data-col-index="${colIndex}" title="Копировать столбец">📋</button>`;
        th.appendChild(wrap);
        theadRow.appendChild(th);
    });
    theadRow.querySelectorAll('.btn-copy-col').forEach(btn => {
        btn.addEventListener('click', () => copyColumnToClipboard(parseInt(btn.getAttribute('data-col-index'), 10)));
    });

    tableBody.innerHTML = '';
    results.forEach((item, index) => {
        const normalized = normalizeResultForColumns(item, tableColumns);
        createTableRow(tableBody, normalized, index, tableColumns);
    });

    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection && results.length > 0) resultsSection.style.display = 'block';
}

async function copyColumnToClipboard(colIndex) {
    const tableBody = document.getElementById('resultsTableBody');
    if (!tableBody) return;
    const rows = tableBody.querySelectorAll('tr');
    const values = [];
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells[colIndex]) values.push(cells[colIndex].textContent.trim());
    });
    const text = values.join('\n');
    try {
        await navigator.clipboard.writeText(text);
        showMessage(`Скопировано ${values.length} значений из столбца`, 'success');
    } catch (e) {
        showMessage('Ошибка при копировании', 'error');
    }
}

// Создание строки таблицы по колонкам
function createTableRow(tableBody, item, index, tableColumns) {
    const row = document.createElement('tr');
    row.setAttribute('data-index', index);
    row.setAttribute('data-task-id', item.taskId);

    tableColumns.forEach((col, colIndex) => {
        const td = document.createElement('td');
        td.className = col.id === 'id' ? 'task-id' : col.id === 'summary' ? 'summary' : 'col-' + col.id;
        td.setAttribute('data-col-id', col.id);

        if (item.hasError && col.id === 'summary') {
            const errorText = document.createElement('span');
            errorText.textContent = item.summary || item.error?.message || 'Ошибка получения данных';
            errorText.style.color = '#dc3545';
            const retryButton = document.createElement('button');
            retryButton.className = 'btn btn-small btn-secondary';
            retryButton.textContent = '🔄 Повторить';
            retryButton.style.marginLeft = '10px';
            retryButton.style.padding = '2px 8px';
            retryButton.style.fontSize = '11px';
            retryButton.addEventListener('click', async () => { await retryTaskStatus(item.taskId, index); });
            td.appendChild(errorText);
            td.appendChild(retryButton);
        } else {
            let val = item[col.id];
            if (item.isLoading && val !== 'Загрузка...') val = 'Загрузка...';
            td.textContent = val != null ? String(val) : '';
            if (item.isLoading) {
                td.style.color = '#666';
                td.style.fontStyle = 'italic';
            }
            if (item.hasError && col.id !== 'summary' && col.id !== 'id') {
                td.innerHTML = '<span style="color: #dc3545;">Ошибка</span>';
            }
        }
        row.appendChild(td);
    });
    tableBody.appendChild(row);
}

// Обновление строки таблицы по колонкам
function updateTableRow(index, item, tableColumns) {
    const tableBody = document.getElementById('resultsTableBody');
    const row = tableBody?.querySelector(`tr[data-index="${index}"]`);
    if (!row) return;

    const cells = row.querySelectorAll('td');
    tableColumns.forEach((col, colIndex) => {
        const td = cells[colIndex];
        if (!td) return;
        td.innerHTML = '';
        td.style = '';
        if (item.hasError && col.id === 'summary') {
            const errorText = document.createElement('span');
            errorText.textContent = item.summary || item.error?.message || 'Ошибка получения данных';
            errorText.style.color = '#dc3545';
            const retryButton = document.createElement('button');
            retryButton.className = 'btn btn-small btn-secondary';
            retryButton.textContent = '🔄 Повторить';
            retryButton.style.marginLeft = '10px';
            retryButton.style.padding = '2px 8px';
            retryButton.style.fontSize = '11px';
            retryButton.addEventListener('click', async () => { await retryTaskStatus(item.taskId, index); });
            td.appendChild(errorText);
            td.appendChild(retryButton);
        } else {
            let val = item[col.id];
            if (item.isLoading) val = 'Загрузка...';
            td.textContent = val != null ? String(val) : '';
            if (item.isLoading) {
                td.style.color = '#666';
                td.style.fontStyle = 'italic';
            }
            if (item.hasError && col.id !== 'summary' && col.id !== 'id') {
                td.innerHTML = '<span style="color: #dc3545;">Ошибка</span>';
            }
        }
    });
}

// Повторный запрос данных задачи
async function retryTaskStatus(taskId, index) {
    const [settings, tableColumns] = await Promise.all([
        chrome.storage.local.get(['youtrackHost', 'youtrackToken']),
        getTableColumns()
    ]);

    if (!settings.youtrackHost || !settings.youtrackToken) {
        showMessage('Сначала сохраните настройки (Host и Token)', 'error');
        return;
    }

    const tableBody = document.getElementById('resultsTableBody');
    const row = tableBody?.querySelector(`tr[data-index="${index}"]`);
    if (row) {
        row.querySelectorAll('td').forEach(td => {
            td.textContent = 'Загрузка...';
            td.style.color = '#666';
            td.style.fontStyle = 'italic';
            td.innerHTML = '';
        });
    }

    try {
        addLog(`Повторный запрос для ${taskId}...`, 'info');
        const taskData = await fetchTaskStatus(taskId, settings.youtrackHost, settings.youtrackToken);
        const result = apiResponseToRow(taskId, taskData, tableColumns);
        Object.assign(result, { isLoading: false, hasError: false, error: null });
        updateTableRow(index, result, tableColumns);
        const savedResults = await chrome.storage.local.get(['resultsData']);
        if (savedResults.resultsData && savedResults.resultsData[index]) {
            savedResults.resultsData[index] = result;
            await chrome.storage.local.set({ resultsData: savedResults.resultsData });
        }
        showMessage(`Данные для ${taskId} обновлены`, 'success');
    } catch (error) {
        addLog(`Ошибка при повторном запросе ${taskId}: ${error.message}`, 'error', { taskId, error: error.toString() });
        const row = { taskId };
        tableColumns.forEach(col => {
            row[col.id] = col.id === 'summary' ? error.message.substring(0, 50) : (col.id === 'id' ? taskId : 'Ошибка');
        });
        const result = { ...row, isLoading: false, hasError: true, error };
        updateTableRow(index, result, tableColumns);
        showMessage(`Ошибка при загрузке ${taskId}`, 'error');
    }
}

// Копирование первой колонки (удобная кнопка «Копировать статусы»)
document.getElementById('copyStatuses').addEventListener('click', () => copyColumnToClipboard(0));

// Копирование таблицы результатов (заголовки из thead, строки из tbody)
document.getElementById('copyResults').addEventListener('click', async () => {
    const theadRow = document.getElementById('resultsTableHead')?.querySelector('tr');
    const tableBody = document.getElementById('resultsTableBody');
    if (!theadRow || !tableBody) return;
    const rows = tableBody.querySelectorAll('tr');
    if (rows.length === 0) {
        showMessage('Нет данных для копирования', 'warning');
        return;
    }
    const headers = [];
    theadRow.querySelectorAll('th').forEach(th => {
        const label = th.querySelector('.th-wrap span')?.textContent || th.textContent.trim();
        headers.push(label);
    });
    let text = headers.join('\t') + '\n';
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const parts = [];
        cells.forEach(cell => parts.push(cell.textContent.trim().replace(/\n/g, ' ')));
        text += parts.join('\t') + '\n';
    });
    try {
        await navigator.clipboard.writeText(text);
        showMessage('Таблица скопирована в буфер обмена!', 'success');
    } catch (error) {
        addLog('Ошибка при копировании таблицы: ' + error.message, 'error', error);
        showMessage('Ошибка при копировании', 'error');
    }
});

// Управление логами
document.getElementById('toggleLogs').addEventListener('click', () => {
    const logsSection = document.getElementById('logsSection');
    logsSection.style.display = 'block';
    updateLogsDisplay();
});

document.getElementById('hideLogs').addEventListener('click', () => {
    const logsSection = document.getElementById('logsSection');
    logsSection.style.display = 'none';
});

document.getElementById('clearLogs').addEventListener('click', async () => {
    logs = [];
    updateLogsDisplay();
    // Очищаем сохраненные логи
    await chrome.storage.local.remove(['debugLogs']);
    addLog('Логи очищены', 'info');
});

document.getElementById('copyLogs').addEventListener('click', async () => {
    const logsText = formatLogsAsText(logs);
    
    try {
        await navigator.clipboard.writeText(logsText);
        addLog('Логи скопированы в буфер обмена', 'success');
        showMessage('Логи скопированы!', 'success');
    } catch (error) {
        const errorDetails = {
            error: error.message,
            errorType: error.name || 'Error',
            errorString: error.toString(),
            stack: error.stack,
            action: 'copyLogs',
            timestamp: new Date().toISOString()
        };
        addLog('Ошибка при копировании логов: ' + error.message, 'error', errorDetails);
        showMessage('Ошибка при копировании', 'error');
    }
});

// Функция форматирования логов в текст
function formatLogsAsText(logsArray) {
    return logsArray.map(log => {
        const timeStr = new Date(log.timestamp).toLocaleString('ru-RU');
        const detailsStr = log.details ? '\n' + JSON.stringify(log.details, null, 2) : '';
        return `[${timeStr}] ${log.type.toUpperCase()}: ${log.message}${detailsStr}`;
    }).join('\n\n');
}

// Сохранение логов в файл
async function saveLogsToFile() {
    try {
        const logsText = formatLogsAsText(logs);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `youtrack-extension-logs-${timestamp}.txt`;
        
        // Создаем Blob с логами
        const blob = new Blob([logsText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        // Создаем временную ссылку для скачивания
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Освобождаем URL
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        addLog(`Логи сохранены в файл: ${filename}`, 'success');
        showMessage(`Логи сохранены в файл: ${filename}`, 'success');
    } catch (error) {
        addLog('Ошибка при сохранении логов в файл: ' + error.message, 'error', error);
        showMessage('Ошибка при сохранении файла', 'error');
    }
}


// Перехватываем все ошибки и добавляем в логи
window.addEventListener('error', (event) => {
    const errorDetails = {
        error: event.message,
        errorType: event.error?.name || 'Error',
        errorString: event.error?.toString(),
        stack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        timestamp: new Date().toISOString()
    };
    addLog('Ошибка: ' + event.message, 'error', errorDetails);
});

window.addEventListener('unhandledrejection', (event) => {
    const errorDetails = {
        error: event.reason?.message || event.reason?.toString() || 'Неизвестная ошибка Promise',
        errorType: event.reason?.name || 'UnhandledRejection',
        errorString: event.reason?.toString(),
        stack: event.reason?.stack,
        reason: event.reason,
        timestamp: new Date().toISOString()
    };
    addLog('Необработанная ошибка Promise: ' + (event.reason?.message || event.reason?.toString() || 'Неизвестная ошибка'), 'error', errorDetails);
});

// Показ сообщений
function showMessage(text, type) {
    const messageEl = document.getElementById('statusMessage');
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
    
    // Добавляем в логи
    addLog(text, type);
    
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 3000);
    }
}
