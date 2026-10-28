#!/bin/sh
# Kunlik zaxira: SQLite bazaning izchil nusxasi + yuklangan fayllar.
# Cron: 0 3 * * * /opt/medassist/scripts/backup.sh
set -e
APP_DIR="${APP_DIR:-/opt/medassist}"
DEST="${BACKUP_DIR:-/var/backups/medassist}"
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$DEST"
if command -v sqlite3 >/dev/null; then sqlite3 "$APP_DIR/data/medassist.db" ".backup '$DEST/medassist-$STAMP.db'"; else node "$APP_DIR/scripts/backup.mjs" "$APP_DIR/data" "$DEST"; fi
tar -czf "$DEST/uploads-$STAMP.tar.gz" -C "$APP_DIR/data" uploads
find "$DEST" -type f -mtime +30 -delete
echo "Zaxira tayyor: $DEST ($STAMP)"
