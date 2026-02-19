#!/usr/bin/env bash
# Обновляет описание каждого GitHub Release так, чтобы в нём были только заметки этой версии из CHANGELOG.md.
# Требует: gh (GitHub CLI) и авторизацию (gh auth login).
set -e
cd "$(dirname "$0")/.."
CHANGELOG="CHANGELOG.md"
for tag in $(git tag -l 'v*' --sort=version:refname); do
  VERSION="${tag#v}"
  VERSION_ESC=$(echo "$VERSION" | sed 's/\./\\./g')
  echo "Updating release $tag ..."
  awk -v ver="$VERSION_ESC" '
    BEGIN { re = "^## \\[" ver "\\]" }
    $0 ~ re { p = 1 }
    p { if ($0 ~ /^---$/) exit; print }
  ' "$CHANGELOG" > /tmp/release_notes_"$tag".md
  if [ ! -s /tmp/release_notes_"$tag".md ]; then
    echo "  (no notes for $VERSION in CHANGELOG, skip)"
    rm -f /tmp/release_notes_"$tag".md
    continue
  fi
  gh release edit "$tag" --notes-file /tmp/release_notes_"$tag".md
  rm -f /tmp/release_notes_"$tag".md
done
echo "Done."
