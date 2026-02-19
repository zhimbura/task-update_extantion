# Скрипты

## update-release-notes.sh

Обновляет описание каждого GitHub Release так, чтобы в нём были только заметки **этой** версии из CHANGELOG.md (а не весь changelog).

**Как запустить:**

1. Установи [GitHub CLI](https://cli.github.com/) и авторизуйся:
   ```bash
   gh auth login
   ```
2. Из корня репозитория:
   ```bash
   ./scripts/update-release-notes.sh
   ```

Скрипт перебирает все теги `v*`, вырезает из CHANGELOG.md блок для каждой версии и подставляет его в описание соответствующего релиза на GitHub.
