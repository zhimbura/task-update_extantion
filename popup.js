// Колонки таблицы по умолчанию (id = имя поля в API); visible: true = колонка показывается в таблице
const DEFAULT_TABLE_COLUMNS = [
    { id: 'Stage', label: 'Статус', visible: true },
    { id: 'id', label: 'Задача', visible: true },
    { id: 'summary', label: 'Описание', visible: true }
];

// Плейсхолдер для строк, в которых не удалось распознать ID задачи
const PARSE_ERROR_ID = '__PARSE_ERROR__';
const PARSE_ERROR_LABEL = 'ошибка парсинга';
const PARSE_ERROR_COPY = 'ошибка парсинга задачи';

// Логирование в консоль
function addLog(message, type = 'info', details = null) {
    const consoleMethod = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
    const timeStr = new Date().toLocaleTimeString();
    if (details != null) {
        console[consoleMethod](`[${timeStr}] ${message}`, details);
    } else {
        console[consoleMethod](`[${timeStr}] ${message}`);
    }
}

// Обработка сообщений (для логов)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'log') {
        addLog(request.message, request.type || 'info', request.details);
        sendResponse({ success: true });
        return true;
    }
});

// Загрузка сохраненных настроек
document.addEventListener('DOMContentLoaded', async () => {
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

// Рендер списка колонок в настройках (чекбокс = включить колонку в таблице)
function renderTableColumnsList(columns) {
    const container = document.getElementById('tableColumnsList');
    if (!container) return;
    container.innerHTML = '';
    (columns || DEFAULT_TABLE_COLUMNS).forEach((col, index) => {
        const visible = col.visible !== false;
        const row = document.createElement('div');
        row.className = 'column-row';
        row.innerHTML = `
            <label class="col-visible-wrap" title="${visible ? 'Колонка отображается' : 'Колонка скрыта'}">
                <input type="checkbox" class="col-visible" data-index="${index}" ${visible ? 'checked' : ''}>
            </label>
            <input type="text" class="col-field" data-index="${index}" placeholder="Поле (id, summary, Stage...)" value="${escapeHtml(col.id)}" title="Поле YouTrack: id, summary или имя кастомного поля">
            <input type="text" class="col-label" data-index="${index}" placeholder="Подпись колонки" value="${escapeHtml(col.label)}">
            <button type="button" class="btn-remove-col" data-index="${index}" title="Удалить колонку">✕</button>
        `;
        container.appendChild(row);
    });
    container.querySelectorAll('.col-visible').forEach(cb => {
        cb.addEventListener('change', () => syncTableColumnsFromDOM());
    });
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
        const visibleCb = row.querySelector('.col-visible');
        const fieldInput = row.querySelector('.col-field');
        const labelInput = row.querySelector('.col-label');
        if (fieldInput && labelInput) {
            const id = (fieldInput.value || '').trim() || 'Field';
            const visible = visibleCb ? visibleCb.checked : true;
            cols.push({ id, label: (labelInput.value || '').trim() || id, visible });
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
    const raw = Array.isArray(st.tableColumns) && st.tableColumns.length > 0 ? st.tableColumns : DEFAULT_TABLE_COLUMNS;
    return raw.map(c => ({ ...c, visible: c.visible !== false }));
}

// Переключение на раздел настроек
function showSettingsView() {
    document.getElementById('mainView').style.display = 'none';
    document.getElementById('settingsView').style.display = 'block';
    getTableColumns().then(renderTableColumnsList);
}

// Переключение на основной раздел (перерисовываем таблицу, чтобы применить видимость колонок)
async function showMainView() {
    document.getElementById('settingsView').style.display = 'none';
    document.getElementById('mainView').style.display = 'block';
    const { resultsData } = await chrome.storage.local.get(['resultsData']);
    if (resultsData && resultsData.length > 0) {
        const tableColumns = await getTableColumns();
        displayResults(resultsData, tableColumns);
        document.getElementById('resultsSection').style.display = 'block';
    }
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
        let taskId = row.getAttribute('data-task-id');
        if (!taskId) return;
        const isParseError = row.hasAttribute('data-parse-error');
        const cells = row.querySelectorAll('td');
        const item = { taskId: isParseError ? PARSE_ERROR_ID : taskId, isParseError };
        if (isParseError) {
            cells.forEach((cell, i) => {
                const colId = cell.getAttribute('data-col-id');
                if (colId) item[colId] = PARSE_ERROR_LABEL;
            });
            item.hasError = true;
            item.error = null;
            item.isLoading = false;
            results.push(item);
            return;
        }
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
    cols.push({ id: 'Field', label: 'Новая колонка', visible: true });
    saveTableColumns(cols);
    renderTableColumnsList(cols);
});

// Кнопка очистки данных
document.getElementById('clearData').addEventListener('click', async () => {
    await clearData();
});

// Парсинг списка задач из текста
// Поддерживаем разные тире и несколько ID в одной строке (чтобы не терять задачи при копипасте)
function parseTaskList(text) {
    if (!text || !text.trim()) {
        return [];
    }
    const normalizeDashes = (s) => String(s).replace(/[\u2010-\u2014\u2212–—−]/g, '-');
    const idRegex = /([A-Za-z]+)-(\d+)/gi;
    const tasks = [];
    const lines = text.split(/[\n,;]+/);
    let linesWithNoId = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const normalized = normalizeDashes(trimmed);
        let found = 0;
        for (const match of normalized.matchAll(idRegex)) {
            tasks.push((match[1] + '-' + match[2]).toUpperCase());
            found++;
        }
        if (found === 0) {
            linesWithNoId++;
            tasks.push(PARSE_ERROR_ID);
        }
    }

    if (linesWithNoId > 0) {
        addLog(`Парсинг: непустых строк без ID: ${linesWithNoId}`, 'info');
    }
    return tasks;
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
    addLog(`Распознано задач: ${tasks.length}: ${tasks.join(', ')}`, 'info');

    const tableColumns = await getTableColumns();
    showMessage(`Загрузка полей для ${tasks.length} задач...`, 'info');
    document.getElementById('loadStatuses').disabled = true;

    const results = tasks.map(taskId => {
        if (taskId === PARSE_ERROR_ID) {
            const row = { taskId: PARSE_ERROR_ID, isParseError: true, isLoading: false, hasError: true, error: null };
            tableColumns.forEach(col => { row[col.id] = PARSE_ERROR_LABEL; });
            return row;
        }
        const row = { taskId, isLoading: true, hasError: false, error: null };
        tableColumns.forEach(col => { row[col.id] = 'Загрузка...'; });
        return row;
    });

    displayResults(results, tableColumns);
    document.getElementById('resultsSection').style.display = 'block';

    let completedCount = 0;
    const updatePromises = tasks.map(async (taskId, index) => {
        if (taskId === PARSE_ERROR_ID) {
            completedCount++;
            if (completedCount === tasks.length) {
                document.getElementById('loadStatuses').disabled = false;
                showMessage(`Загружено ${results.filter(r => !r.isParseError).length} задач, строк с ошибкой парсинга: ${results.filter(r => r.isParseError).length}`, results.some(r => r.isParseError) ? 'warning' : 'success');
            }
            return;
        }
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
                const parseErrors = results.filter(r => r.isParseError).length;
                showMessage(parseErrors > 0 ? `Загружено ${completedCount - parseErrors} задач, ошибок парсинга: ${parseErrors}` : `Загружено ${completedCount} задач`, parseErrors > 0 ? 'warning' : 'success');
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
                const parseErrors = results.filter(r => r.isParseError).length;
                const apiErrors = results.filter(r => r.hasError && !r.isParseError).length;
                const successCount = completedCount - parseErrors - apiErrors;
                const msg = parseErrors > 0 ? `Загружено ${successCount}, ошибок API: ${apiErrors}, ошибок парсинга: ${parseErrors}` : `Загружено ${successCount} из ${completedCount}. Ошибок: ${apiErrors}`;
                showMessage(msg, apiErrors > 0 || parseErrors > 0 ? 'warning' : 'success');
                document.getElementById('loadStatuses').disabled = false;
            }
        }
    });

    // Ждем завершения всех запросов
    await Promise.all(updatePromises);
});

// Запрос полей задачи из YouTrack API (id, idReadable, summary, все customFields по имени; value — число для дат или объект с name)
async function fetchTaskStatus(taskId, host, token) {
    const baseHost = (host || '').trim().replace(/\/+$/, '');
    // Проверено через curl: только value(name) раскрывает enum/state (value(name),value даёт только $type). Даты при value(name) приходят числом.
const url = `${baseHost}/api/issues/${taskId}?fields=id,idReadable,summary,project(name,shortName),customFields(name,value(name))`;
    
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

    // Полный вывод response от API в формате JSON
    addLog(`${taskId}: полный response API (JSON)`, 'info', json);

    // Лог: что пришло от API (сразу одна строка, чтобы было видно даже без details)
    const cfCount = Array.isArray(json.customFields) ? json.customFields.length : 0;
    addLog(`${taskId}: ответ получен, кастомных полей: ${cfCount}`, 'info');
    let received;
    try {
        received = {
            id: json.idReadable ?? json.id,
            summaryLength: (json.summary || '').length,
            project: json.project ? (json.project.name || json.project.shortName) : null,
            customFieldsCount: cfCount,
            customFieldsRaw: Array.isArray(json.customFields) ? json.customFields.map(f => ({
                name: f.name,
                valueType: f.value == null ? 'null' : Array.isArray(f.value) ? `array[${f.value.length}]` : typeof f.value,
                valueHint: f.value == null ? null : Array.isArray(f.value) ? (f.value[0] && typeof f.value[0] === 'object' && f.value[0].name) ? f.value.map(x => x.name).join(', ') : '(items)' : (typeof f.value === 'object' ? (f.value.name ?? f.value.id ?? '(object)') : String(f.value).slice(0, 50))
            })) : []
        };
        addLog(`${taskId}: получен ответ API`, 'info', received);
    } catch (e) {
        addLog(`${taskId}: ошибка при формировании лога ответа: ${e.message}`, 'warning', { error: String(e) });
    }

    const summary = json.summary || 'Нет описания';
    const customFields = {};
    if (Array.isArray(json.customFields)) {
        json.customFields.forEach(f => {
            if (!f.name) return;
            const v = f.value;
            let parsed;
            let branch;
            if (v === null || v === undefined) {
                customFields[f.name] = '—';
                branch = 'null→"—"';
                parsed = '—';
            } else if (typeof v === 'number') {
                parsed = formatTimestamp(v);
                customFields[f.name] = parsed;
                branch = 'number→date';
            } else if (typeof v === 'object' && typeof v.value === 'number') {
                parsed = formatTimestamp(v.value);
                customFields[f.name] = parsed;
                branch = 'object.value(number)→date';
            } else if (Array.isArray(v)) {
                const s = v.length === 0 ? 'empty' : v.map(x => getDisplayFromObject(x) || (x != null && typeof x !== 'object' ? String(x) : '')).filter(Boolean).join(', ');
                customFields[f.name] = s;
                branch = 'array→join';
                parsed = s;
            } else if (typeof v === 'object') {
                const arr = Array.isArray(v.value) ? v.value : Array.isArray(v.values) ? v.values : null;
                if (arr !== null) {
                    const s = arr.length === 0 ? 'empty' : arr.map(x => getDisplayFromObject(x) || (x != null && typeof x !== 'object' ? String(x) : '')).filter(Boolean).join(', ');
                    customFields[f.name] = s;
                    branch = 'object.value/values(array)→join';
                    parsed = s;
                } else {
                    const obj = v.value && typeof v.value === 'object' && !Array.isArray(v.value) ? v.value : v;
                    const s = getDisplayFromObject(obj);
                    customFields[f.name] = s;
                    branch = 'object→getDisplayFromObject';
                    parsed = s;
                }
            } else if (typeof v === 'string') {
                customFields[f.name] = v;
                branch = 'string→as is';
                parsed = v.length > 50 ? v.slice(0, 50) + '…' : v;
            } else {
                customFields[f.name] = String(v);
                branch = 'other→String';
                parsed = String(v).slice(0, 50);
            }
            const parsedStr = typeof parsed === 'string' ? (parsed.length > 60 ? parsed.slice(0, 60) + '…' : parsed) : String(parsed);
            addLog(`  ${f.name}: ${branch} → ${JSON.stringify(parsedStr)}`, 'info');
        });
    }
    const projectName = json.project ? (json.project.name || json.project.shortName || '') : '';
    const result = {
        id: json.idReadable || json.id || taskId,
        summary,
        project: projectName,
        customFields
    };
    addLog(`${taskId}: распарсено полей: ${Object.keys(result.customFields).length}`, 'success');
    addLog(`${taskId}: распарсено`, 'success', { id: result.id, project: result.project, customFieldsKeys: Object.keys(result.customFields), customFields: result.customFields });
    return result;
}

// Извлечь отображаемую строку из объекта (enum/state): проверяем разные ключи API
function getDisplayFromObject(obj) {
    if (obj == null || typeof obj !== 'object') return '';
    // Сначала вложенный value (REST иногда отдаёт { value: { name: "..." } })
    const nested = obj.value && typeof obj.value === 'object' && !Array.isArray(obj.value);
    if (nested) {
        const fromNested = getDisplayFromObject(obj.value);
        if (fromNested) return fromNested;
    }
    const s = (obj.name != null && String(obj.name).trim() !== '') ? String(obj.name)
        : (obj.localizedName != null && String(obj.localizedName).trim() !== '') ? String(obj.localizedName)
        : (obj.presentation != null && String(obj.presentation).trim() !== '') ? String(obj.presentation)
        : (obj.id != null) ? String(obj.id)
        : (obj.ringId != null) ? String(obj.ringId)
        : '';
    if (s) return s;
    // Любая непустая строка из объекта (кроме $type)
    for (const [key, val] of Object.entries(obj)) {
        if (key === '$type') continue;
        if (typeof val === 'string' && val.trim() !== '') return val;
    }
    return '';
}

// Форматирование timestamp (мс) в дату и время: "25 фев. 2026 12:00"
function formatTimestamp(ms) {
    if (ms == null || typeof ms !== 'number') return '';
    const d = new Date(ms);
    if (isNaN(d.getTime())) return String(ms);
    const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${dateStr} ${timeStr}`;
}

// Преобразовать ответ API в объект строки по колонкам (id колонки = имя поля в API)
function apiResponseToRow(taskId, apiData, columns) {
    const row = { taskId };
    const cf = apiData.customFields || {};
    columns.forEach(col => {
        if (col.id === 'id') row[col.id] = apiData.id || taskId;
        else if (col.id === 'summary') row[col.id] = apiData.summary || '';
        else if (col.id === 'project' || col.id === 'Project') row[col.id] = apiData.project ?? '';
        else row[col.id] = cf[col.id] ?? '';
    });
    return row;
}

// Нормализация старых результатов (status/summary) в формат по колонкам
function normalizeResultForColumns(item, columns) {
    const out = { taskId: item.taskId, isLoading: item.isLoading, hasError: item.hasError, error: item.error, isParseError: !!item.isParseError };
    if (item.isParseError || item.taskId === PARSE_ERROR_ID) {
        out.taskId = PARSE_ERROR_ID;
        out.isParseError = true;
        columns.forEach(col => { out[col.id] = PARSE_ERROR_LABEL; });
        return out;
    }
    columns.forEach(col => {
        if (item[col.id] !== undefined) out[col.id] = item[col.id];
        else if (col.id === 'summary') out[col.id] = item.summary != null ? item.summary : '';
        else if (col.id === 'id') out[col.id] = item.taskId || '';
        else if (col.id === 'project' || col.id === 'Project') out[col.id] = item.project ?? item.Project ?? '';
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
        const visible = col.visible !== false;
        const th = document.createElement('th');
        if (!visible) th.classList.add('col-hidden');
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
        const isParseError = row.hasAttribute('data-parse-error');
        const cells = row.querySelectorAll('td');
        if (cells[colIndex]) {
            values.push(isParseError ? PARSE_ERROR_COPY : cells[colIndex].textContent.trim());
        }
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
    if (item.isParseError) row.setAttribute('data-parse-error', '1');

    tableColumns.forEach((col, colIndex) => {
        const visible = col.visible !== false;
        const td = document.createElement('td');
        td.className = col.id === 'id' ? 'task-id' : col.id === 'summary' ? 'summary' : 'col-' + col.id;
        if (!visible) td.classList.add('col-hidden');
        td.setAttribute('data-col-id', col.id);

        if (item.isParseError) {
            td.textContent = PARSE_ERROR_LABEL;
            td.style.color = '#dc3545';
        } else if (item.hasError && col.id === 'summary') {
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
        if (item.isParseError) {
            td.textContent = PARSE_ERROR_LABEL;
            td.style.color = '#dc3545';
        } else if (item.hasError && col.id === 'summary') {
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
    if (taskId === PARSE_ERROR_ID) return;
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

// Копирование таблицы результатов (только видимые колонки)
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
    const visibleIndices = [];
    theadRow.querySelectorAll('th').forEach((th, i) => {
        if (th.classList.contains('col-hidden')) return;
        visibleIndices.push(i);
        const label = th.querySelector('.th-wrap span')?.textContent || th.textContent.trim();
        headers.push(label);
    });
    let text = headers.join('\t') + '\n';
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const isParseError = row.hasAttribute('data-parse-error');
        const parts = [];
        visibleIndices.forEach(i => {
            if (cells[i]) parts.push(isParseError ? PARSE_ERROR_COPY : cells[i].textContent.trim().replace(/\n/g, ' '));
        });
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

// Перехватываем все ошибки и пишем в консоль
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
