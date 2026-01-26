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
        'resultsData'
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
    if (settings.resultsData && settings.resultsData.length > 0) {
        displayResults(settings.resultsData);
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

// Переключение на раздел настроек
function showSettingsView() {
    document.getElementById('mainView').style.display = 'none';
    document.getElementById('settingsView').style.display = 'block';
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

// Получение текущих результатов из таблицы
function getCurrentResults() {
    const tableBody = document.getElementById('resultsTableBody');
    if (!tableBody) return [];
    
    const rows = tableBody.querySelectorAll('tr');
    const results = [];
    
    rows.forEach((row, index) => {
        const taskId = row.getAttribute('data-task-id');
        const statusCell = row.querySelector('td.status');
        const summaryCell = row.querySelector('td.summary');
        
        if (taskId && statusCell) {
            const statusText = statusCell.textContent.trim();
            const summaryText = summaryCell ? summaryCell.textContent.trim() : '';
            
            results.push({
                taskId: taskId,
                status: statusText === 'Загрузка...' ? 'Загрузка...' : (statusText === 'Ошибка' ? 'Ошибка' : statusText),
                summary: summaryText,
                isLoading: statusText === 'Загрузка...',
                hasError: statusText === 'Ошибка',
                error: statusText === 'Ошибка' ? new Error(summaryText) : null
            });
        }
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

    showMessage(`Загрузка статусов для ${tasks.length} задач...`, 'info');
    document.getElementById('loadStatuses').disabled = true;

    // Создаем начальные результаты со статусом "Загрузка..."
    const results = tasks.map(taskId => ({
        taskId: taskId,
        status: 'Загрузка...',
        summary: '',
        isLoading: true,
        hasError: false,
        error: null
    }));

    // Строим таблицу сразу
        displayResults(results);
        document.getElementById('resultsSection').style.display = 'block';

    // Загружаем статусы асинхронно и обновляем таблицу по мере получения
    let completedCount = 0;
    const updatePromises = tasks.map(async (taskId, index) => {
        try {
            addLog(`Запрос статуса для ${taskId}...`, 'info');
            const taskData = await fetchTaskStatus(taskId, settings.youtrackHost, settings.youtrackToken);
            addLog(`${taskId}: ${taskData.status}`, 'success');
            
            // Обновляем результат
            results[index] = {
                taskId: taskId,
                status: taskData.status,
                summary: taskData.summary,
                isLoading: false,
                hasError: false,
                error: null
            };
            
            // Обновляем таблицу
            updateTableRow(index, results[index]);
            completedCount++;
            
            // Сохраняем результаты после каждого обновления
            await saveResults(results);
            
            if (completedCount === tasks.length) {
                showMessage(`Загружено ${completedCount} статусов`, 'success');
                document.getElementById('loadStatuses').disabled = false;
            }
        } catch (error) {
            addLog(`Ошибка для ${taskId}: ${error.message}`, 'error', {
                taskId: taskId,
                error: error.toString()
            });
            
            // Обновляем результат с ошибкой
            results[index] = {
                taskId: taskId,
                status: 'Ошибка',
                summary: error.message.substring(0, 50),
                isLoading: false,
                hasError: true,
                error: error
            };
            
            // Обновляем таблицу
            updateTableRow(index, results[index]);
            completedCount++;
            
            // Сохраняем результаты после каждого обновления
            await saveResults(results);
            
            if (completedCount === tasks.length) {
                const errorCount = results.filter(r => r.hasError).length;
                const successCount = completedCount - errorCount;
                showMessage(`Загружено ${successCount} из ${completedCount} статусов. Ошибок: ${errorCount}`, errorCount > 0 ? 'warning' : 'success');
                document.getElementById('loadStatuses').disabled = false;
            }
        }
    });

    // Ждем завершения всех запросов
    await Promise.all(updatePromises);
});

// Запрос статуса и описания задачи из YouTrack API
async function fetchTaskStatus(taskId, host, token) {
    const url = `${host}/api/issues/${taskId}?fields=summary,customFields(name,value(name))`;
    
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

    // Получаем описание (summary)
    const summary = json.summary || 'Нет описания';

    // Ищем статус: сначала "Stage3", если нет - то "Stage"
    let status = 'Unknown';
    if (json.customFields) {
        addLog(`Найдено ${json.customFields.length} customFields для ${taskId}`, 'info');
        for (let i = 0; i < json.customFields.length; i++) {
            if (json.customFields[i].name === 'Stage3' && 
                json.customFields[i].value && 
                json.customFields[i].value.name) {
                status = json.customFields[i].value.name;
                addLog(`Найден Stage3 для ${taskId}: ${status}`, 'success');
                break;
            }
        }
        
        if (status === 'Unknown') {
            for (let i = 0; i < json.customFields.length; i++) {
                if (json.customFields[i].name === 'Stage' && 
                    json.customFields[i].value && 
                    json.customFields[i].value.name) {
                    status = json.customFields[i].value.name;
                    addLog(`Найден Stage для ${taskId}: ${status}`, 'success');
                    break;
                }
            }
        }
        
        if (status === 'Unknown') {
            addLog(`Статус не найден для ${taskId}. Доступные поля: ${json.customFields.map(f => f.name).join(', ')}`, 'warning', {
                taskId,
                availableFields: json.customFields.map(f => f.name)
            });
        }
    } else {
        addLog(`Нет customFields в ответе для ${taskId}`, 'warning', { taskId, json });
    }

    return { status, summary };
}

// Отображение результатов в таблице
function displayResults(results) {
    const tableBody = document.getElementById('resultsTableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';

    results.forEach((item, index) => {
        createTableRow(tableBody, item, index);
    });
    
    // Показываем секцию результатов
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection && results.length > 0) {
        resultsSection.style.display = 'block';
    }
}

// Создание строки таблицы
function createTableRow(tableBody, item, index) {
    const row = document.createElement('tr');
    row.setAttribute('data-index', index);
    row.setAttribute('data-task-id', item.taskId);
    
    // Статус (первая колонка)
    const statusCell = document.createElement('td');
    statusCell.className = 'status';
    
    if (item.isLoading) {
        statusCell.textContent = 'Загрузка...';
        statusCell.style.color = '#666';
        statusCell.style.fontStyle = 'italic';
    } else if (item.hasError) {
        statusCell.innerHTML = `<span style="color: #dc3545;">Ошибка</span>`;
        statusCell.style.cursor = 'default';
    } else {
        statusCell.textContent = item.status;
        statusCell.style.cursor = 'pointer';
        statusCell.title = 'Кликните, чтобы скопировать статус';
        statusCell.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(item.status);
                showMessage(`Статус "${item.status}" скопирован!`, 'success');
                statusCell.style.backgroundColor = '#d4edda';
                setTimeout(() => {
                    statusCell.style.backgroundColor = '';
                }, 300);
            } catch (error) {
                showMessage('Ошибка при копировании статуса', 'error');
                addLog('Ошибка при копировании статуса: ' + error.message, 'error', error);
            }
        });
    }
    
    // Задача (вторая колонка)
    const taskCell = document.createElement('td');
    taskCell.className = 'task-id';
    taskCell.textContent = item.taskId;
    
    // Описание (третья колонка)
    const summaryCell = document.createElement('td');
    summaryCell.className = 'summary';
    
    if (item.hasError) {
        const errorText = document.createElement('span');
        errorText.textContent = item.summary || item.error?.message || 'Ошибка получения данных';
        errorText.style.color = '#dc3545';
        
        const retryButton = document.createElement('button');
        retryButton.className = 'btn btn-small btn-secondary';
        retryButton.textContent = '🔄 Повторить';
        retryButton.style.marginLeft = '10px';
        retryButton.style.padding = '2px 8px';
        retryButton.style.fontSize = '11px';
        retryButton.addEventListener('click', async () => {
            await retryTaskStatus(item.taskId, index);
        });
        
        summaryCell.appendChild(errorText);
        summaryCell.appendChild(retryButton);
    } else {
        summaryCell.textContent = item.summary || (item.isLoading ? '' : 'Нет описания');
    }
    
    row.appendChild(statusCell);
    row.appendChild(taskCell);
    row.appendChild(summaryCell);
    tableBody.appendChild(row);
}

// Обновление строки таблицы
function updateTableRow(index, item) {
    const tableBody = document.getElementById('resultsTableBody');
    const row = tableBody.querySelector(`tr[data-index="${index}"]`);
    if (!row) return;
    
    // Обновляем статус
    const statusCell = row.querySelector('td.status');
    if (item.isLoading) {
        statusCell.textContent = 'Загрузка...';
        statusCell.style.color = '#666';
        statusCell.style.fontStyle = 'italic';
        statusCell.style.cursor = 'default';
        statusCell.title = '';
    } else if (item.hasError) {
        statusCell.innerHTML = `<span style="color: #dc3545;">Ошибка</span>`;
        statusCell.style.cursor = 'default';
        statusCell.title = '';
    } else {
        statusCell.textContent = item.status;
        statusCell.style.color = '';
        statusCell.style.fontStyle = '';
        statusCell.style.cursor = 'pointer';
        statusCell.title = 'Кликните, чтобы скопировать статус';
        // Удаляем старые обработчики и добавляем новый
        statusCell.replaceWith(statusCell.cloneNode(true));
        const newStatusCell = row.querySelector('td.status');
        newStatusCell.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(item.status);
                showMessage(`Статус "${item.status}" скопирован!`, 'success');
                newStatusCell.style.backgroundColor = '#d4edda';
                setTimeout(() => {
                    newStatusCell.style.backgroundColor = '';
                }, 300);
            } catch (error) {
                showMessage('Ошибка при копировании статуса', 'error');
                addLog('Ошибка при копировании статуса: ' + error.message, 'error', error);
            }
        });
    }
    
    // Обновляем описание
    const summaryCell = row.querySelector('td.summary');
    summaryCell.innerHTML = '';
    if (item.hasError) {
        const errorText = document.createElement('span');
        errorText.textContent = item.summary || item.error?.message || 'Ошибка получения данных';
        errorText.style.color = '#dc3545';
        
        const retryButton = document.createElement('button');
        retryButton.className = 'btn btn-small btn-secondary';
        retryButton.textContent = '🔄 Повторить';
        retryButton.style.marginLeft = '10px';
        retryButton.style.padding = '2px 8px';
        retryButton.style.fontSize = '11px';
        retryButton.addEventListener('click', async () => {
            await retryTaskStatus(item.taskId, index);
        });
        
        summaryCell.appendChild(errorText);
        summaryCell.appendChild(retryButton);
    } else {
        summaryCell.textContent = item.summary || 'Нет описания';
    }
}

// Повторный запрос статуса задачи
async function retryTaskStatus(taskId, index) {
    const settings = await chrome.storage.local.get([
        'youtrackHost',
        'youtrackToken'
    ]);

    if (!settings.youtrackHost || !settings.youtrackToken) {
        showMessage('Сначала сохраните настройки (Host и Token)', 'error');
        return;
    }

    // Обновляем строку на "Загрузка..."
    const tableBody = document.getElementById('resultsTableBody');
    const row = tableBody.querySelector(`tr[data-index="${index}"]`);
    if (row) {
        const statusCell = row.querySelector('td.status');
        statusCell.textContent = 'Загрузка...';
        statusCell.style.color = '#666';
        statusCell.style.fontStyle = 'italic';
        
        const summaryCell = row.querySelector('td.summary');
        summaryCell.textContent = '';
    }

    try {
        addLog(`Повторный запрос статуса для ${taskId}...`, 'info');
        const taskData = await fetchTaskStatus(taskId, settings.youtrackHost, settings.youtrackToken);
        addLog(`${taskId}: ${taskData.status}`, 'success');
        
        const result = {
            taskId: taskId,
            status: taskData.status,
            summary: taskData.summary,
            isLoading: false,
            hasError: false,
            error: null
        };
        
        updateTableRow(index, result);
        
        // Обновляем сохраненные результаты
        const savedResults = await chrome.storage.local.get(['resultsData']);
        if (savedResults.resultsData && savedResults.resultsData[index]) {
            savedResults.resultsData[index] = result;
            await chrome.storage.local.set({ resultsData: savedResults.resultsData });
        }
        
        showMessage(`Статус для ${taskId} обновлен`, 'success');
    } catch (error) {
        addLog(`Ошибка при повторном запросе ${taskId}: ${error.message}`, 'error', {
            taskId: taskId,
            error: error.toString()
        });
        
        const result = {
            taskId: taskId,
            status: 'Ошибка',
            summary: error.message.substring(0, 50),
            isLoading: false,
            hasError: true,
            error: error
        };
        
        updateTableRow(index, result);
        showMessage(`Ошибка при загрузке статуса для ${taskId}`, 'error');
    }
}

// Копирование только статусов
document.getElementById('copyStatuses').addEventListener('click', async () => {
    const tableBody = document.getElementById('resultsTableBody');
    const rows = tableBody.querySelectorAll('tr');
    
    if (rows.length === 0) {
        showMessage('Нет данных для копирования', 'warning');
        return;
    }
    
    // Формируем текст для копирования (только статусы, по одному на строку)
    let text = '';
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 1) {
            text += cells[0].textContent + '\n'; // Первая колонка - статус
        }
    });
    
    try {
        await navigator.clipboard.writeText(text.trim());
        showMessage('Статусы скопированы в буфер обмена!', 'success');
        addLog('Статусы скопированы', 'success', {
            rowsCount: rows.length
        });
    } catch (error) {
        const errorDetails = {
            error: error.message,
            errorType: error.name || 'Error',
            errorString: error.toString(),
            stack: error.stack,
            action: 'copyStatuses',
            timestamp: new Date().toISOString()
        };
        addLog('Ошибка при копировании статусов: ' + error.message, 'error', errorDetails);
        showMessage('Ошибка при копировании', 'error');
    }
});

// Копирование таблицы результатов
document.getElementById('copyResults').addEventListener('click', async () => {
    const tableBody = document.getElementById('resultsTableBody');
    const rows = tableBody.querySelectorAll('tr');
    
    if (rows.length === 0) {
        showMessage('Нет данных для копирования', 'warning');
        return;
    }
    
    // Формируем текст для копирования (табличный формат)
    let text = 'Статус\tЗадача\tОписание\n';
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
            text += `${cells[0].textContent}\t${cells[1].textContent}\t${cells[2].textContent}\n`;
        }
    });
    
    try {
        await navigator.clipboard.writeText(text);
        showMessage('Таблица скопирована в буфер обмена!', 'success');
        addLog('Таблица результатов скопирована', 'success', {
            rowsCount: rows.length
        });
    } catch (error) {
        const errorDetails = {
            error: error.message,
            errorType: error.name || 'Error',
            errorString: error.toString(),
            stack: error.stack,
            action: 'copyResults',
            timestamp: new Date().toISOString()
        };
        addLog('Ошибка при копировании таблицы: ' + error.message, 'error', errorDetails);
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
