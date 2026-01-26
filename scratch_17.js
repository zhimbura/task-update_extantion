function updateTaskStatuses() {
    const sheetName = 'Релизы'
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName)
    const dataRange = sheet.getDataRange()
    const data = dataRange.getValues()

    const youtrackUrl = 'https://youtrack.wildberries.ru/api/'
    const token = PropertiesService.getScriptProperties().getProperty('YOUTRACK_TOKEN')

    let taskIdColumn = -1
    let statusColumn = -1

    for (let row = 0; row < data.length; row++) {
        for (let col = 0; col < data[row].length; col++) {
            const header = data[row][col].toString().trim()
            switch (header) {
                case 'Старая ссылка':
                case 'Задача': {
                    taskIdColumn = col
                    break
                }
                case 'Текущий статус':
                case 'Статус': {
                    statusColumn = col
                    break
                }
            }
        }

        if (taskIdColumn === -1 || statusColumn === -1) {
            continue
        }

        const fullTaskString = data[row][taskIdColumn].toString().trim()

        const match = fullTaskString.match(/([A-Z]+-\d+)/)
        const taskId = match ? match[1] : null

        if (taskId) {
            try {
                const url = youtrackUrl + 'issues/' + taskId + '?fields=customFields(name,value(name))'  // Запрашиваем статус (custom field "Stage3" или "Stage")
                const options = {
                    'method': 'get',
                    'headers': {
                        'Authorization': 'Bearer ' + token,
                        'Accept': 'application/json'
                    },
                    'muteHttpExceptions': true
                }

                const response = UrlFetchApp.fetch(url, options)
                const json = JSON.parse(response.getContentText())

                // Ищем статус: сначала "Stage3", если нет - то "Stage"
                let status = 'Unknown'
                if (json.customFields) {
                    for (let i = 0; i < json.customFields.length; i++) {
                        if (json.customFields[i].name === 'Stage3' && json.customFields[i].value && json.customFields[i].value.name) {
                            status = json.customFields[i].value.name  // Например, "Dev_InProgress"
                            break
                        }
                    }
                    // Если "Stage3" не найден, ищем "Stage"
                    if (status === 'Unknown') {
                        for (let i = 0; i < json.customFields.length; i++) {
                            if (json.customFields[i].name === 'Stage' && json.customFields[i].value && json.customFields[i].value.name) {
                                status = json.customFields[i].value.name  // Например, "Released"
                                break
                            }
                        }
                    }
                }

                // Обновляем ячейку в Google Sheets
                sheet.getRange(row + 1, statusColumn + 1).setValue(status)  // +1 потому что индексы Sheets начинаются с 1
                Logger.log('Updated ' + taskId + ' to ' + status)

            } catch (e) {
                Logger.log('Error for ' + taskId + ': ' + e)
                sheet.getRange(row + 1, statusColumn + 1).setValue('Error: ' + e.message.substring(0, 20))  // Короткая ошибка
            }
        }
    }
}