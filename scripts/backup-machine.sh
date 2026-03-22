#!/bin/bash
# OpenClaw Machine Auto Backup Script
# Backup to NAS with ZIP compression
#
# Usage:
#   ./backup-machine.sh [machine-name]
#
# Examples:
#   ./backup-machine.sh macmini-m1
#   ./backup-machine.sh macbook-m4

set -e

# Config
MACHINE_NAME="${1:-$(hostname -s | tr '[:upper:]' '[:lower:]')}"
NAS_ROOT="${NAS_ROOT:-/Volumes/SSD_M2_1}"
BACKUP_BASE="$NAS_ROOT/backups/$MACHINE_NAME"
LOG_FILE="${LOG_FILE:-$HOME/logs/openclaw-backup.log}"
KEEP_DAYS="${KEEP_DAYS:-7}"

# Create directories
mkdir -p "$BACKUP_BASE"
mkdir -p "$(dirname "$LOG_FILE")"

# Logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$MACHINE_NAME] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "Starting OpenClaw Backup"
log "=========================================="

# Create temp backup directory
BACKUP_TEMP="$BACKUP_BASE/.temp-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_TEMP"

# 1. Backup config (exclude browser cache)
log "1. Backing up config..."
rsync -a \
    --exclude 'browser/*/user-data/Singleton*' \
    --exclude 'browser/*/user-data/RunningChromeVersion' \
    --exclude 'browser/*/user-data/Cache/*' \
    --exclude 'browser/*/user-data/Code\ Cache/*' \
    --exclude 'logs/*' \
    ~/.openclaw "$BACKUP_TEMP/openclaw-config" 2>/dev/null || true
log "✅ Config backed up"

# 2. Backup services
log "2. Backing up services..."
if [ -d "$HOME/workspace/openclaw-services" ]; then
    rsync -a --exclude 'node_modules' \
        "$HOME/workspace/openclaw-services" "$BACKUP_TEMP/" 2>/dev/null || true
    log "✅ Services backed up"
else
    log "⚠️  openclaw-services not found"
fi

# 3. Backup skills
log "3. Backing up skills..."
if [ -d "$HOME/workspace/skills" ]; then
    rsync -a "$HOME/workspace/skills" "$BACKUP_TEMP/" 2>/dev/null || true
    log "✅ Skills backed up"
else
    log "⚠️  skills not found"
fi

# Compress to ZIP
log "4. Compressing backup..."
BACKUP_ZIP="$BACKUP_BASE/openclaw-$(date +%Y%m%d-%H%M%S).zip"
cd "$BACKUP_TEMP" && zip -r -q "$BACKUP_ZIP" . && cd - > /dev/null
ZIP_SIZE=$(du -sh "$BACKUP_ZIP" | cut -f1)
FILE_COUNT=$(find "$BACKUP_TEMP" -type f | wc -l)
log "✅ Compressed: $BACKUP_ZIP ($ZIP_SIZE)"
log "   Files: $FILE_COUNT"

# Cleanup temp
rm -rf "$BACKUP_TEMP"
log "✅ Temp directory cleaned"

# Cleanup old backups
log "5. Cleaning old backups (older than $KEEP_DAYS days)..."
find "$BACKUP_BASE" -name "openclaw-*.zip" -type f -mtime +$KEEP_DAYS -delete 2>/dev/null || true
BACKUP_COUNT=$(find "$BACKUP_BASE" -name "openclaw-*.zip" -type f 2>/dev/null | wc -l)
log "✅ Current backups: $BACKUP_COUNT"

log "=========================================="
log "✅ Backup completed"
log "=========================================="
log ""
