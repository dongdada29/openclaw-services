#!/bin/bash
# openclaw-services sync script
# 将源码目录同步到运行目录

set -e

SOURCE_DIR="/Users/louis/workspace/openclaw-services"
TARGET_DIR="$HOME/.openclaw/services"

echo "📦 同步 openclaw-services 到运行目录..."

# 检查源码目录
if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ 源码目录不存在: $SOURCE_DIR"
    exit 1
fi

# 创建目标目录
mkdir -p "$TARGET_DIR"

# 同步各服务
for service in watchdog model-proxy config-migrator; do
    if [ -d "$SOURCE_DIR/services/$service" ]; then
        echo "  📁 同步 $service..."
        rsync -av --delete "$SOURCE_DIR/services/$service/" "$TARGET_DIR/$service/"
    fi
done

# 同步 scripts
if [ -d "$SOURCE_DIR/scripts" ]; then
    echo "  📁 同步 scripts..."
    mkdir -p "$TARGET_DIR/../scripts"
    rsync -av --delete "$SOURCE_DIR/scripts/" "$TARGET_DIR/../scripts/"
fi

echo "✅ 同步完成"
echo ""
echo "重启服务生效:"
echo "  launchctl kickstart -k gui/\$(id -u)/com.openclaw.watchdog"
echo "  launchctl kickstart -k gui/\$(id -u)/com.openclaw.model-proxy"
