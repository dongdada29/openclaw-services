#!/bin/bash
# OpenClaw Watchdog 一键安装脚本

set -e

REPO_URL="https://github.com/dongdada29/openclaw-watchdog"
# 支持环境变量覆盖安装路径
INSTALL_DIR="${OPENCLAW_WORKSPACE:-$HOME/workspace}"
SCRIPTS_DIR="$INSTALL_DIR/scripts"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LOGS_DIR="$INSTALL_DIR/logs"
PLIST_NAME="com.dongdada.openclaw-watchdog"
HEALTH_NAME="com.dongdada.openclaw-health"

# 下载文件的辅助函数（带验证）
download_file() {
    local url="$1"
    local output="$2"
    local description="$3"

    echo "   下载 $description..."
    if curl -fsSL --max-time 30 "$url" -o "$output"; then
        # 验证文件非空
        if [ -s "$output" ]; then
            return 0
        else
            echo "❌ 下载失败: 文件为空"
            return 1
        fi
    else
        echo "❌ 下载失败: $url"
        return 1
    fi
}

echo "╔════════════════════════════════════════════════════════════╗"
echo "║        🐕 OpenClaw Watchdog - 安装程序                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 检查依赖
echo "🔍 检查依赖..."
if ! command -v openclaw &> /dev/null; then
    echo "❌ OpenClaw 未安装"
    echo "   请先安装: npm install -g openclaw"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo "❌ curl 未安装"
    exit 1
fi

echo "✅ 依赖检查通过"
echo ""

# 创建目录
echo "📁 创建目录..."
mkdir -p "$SCRIPTS_DIR"
mkdir -p "$LOGS_DIR"
mkdir -p "$LAUNCHD_DIR"
echo "✅ 目录已创建"
echo ""

# 下载脚本（如果从远程安装）
if [ "$1" != "--local" ]; then
    echo "⬇️  下载脚本..."
    DOWNLOAD_FAILED=0

    download_file "$REPO_URL/raw/main/scripts/openclaw-watchdog.sh" \
        "$SCRIPTS_DIR/openclaw-watchdog.sh" "openclaw-watchdog.sh" || DOWNLOAD_FAILED=1

    download_file "$REPO_URL/raw/main/scripts/health-monitor.sh" \
        "$SCRIPTS_DIR/health-monitor.sh" "health-monitor.sh" || DOWNLOAD_FAILED=1

    download_file "$REPO_URL/raw/main/launchd/com.dongdada.openclaw-watchdog.plist" \
        "$LAUNCHD_DIR/$PLIST_NAME.plist" "watchdog.plist" || DOWNLOAD_FAILED=1

    download_file "$REPO_URL/raw/main/launchd/com.dongdada.openclaw-health.plist" \
        "$LAUNCHD_DIR/$HEALTH_NAME.plist" "health.plist" || DOWNLOAD_FAILED=1

    if [ $DOWNLOAD_FAILED -eq 1 ]; then
        echo ""
        echo "❌ 部分文件下载失败，请检查网络连接后重试"
        exit 1
    fi
else
    echo "📦 使用本地文件..."
fi

# 设置权限
chmod +x "$SCRIPTS_DIR/openclaw-watchdog.sh"
chmod +x "$SCRIPTS_DIR/health-monitor.sh"
echo "✅ 脚本已安装"
echo ""

# 检查是否已有定时任务
for plist in "$PLIST_NAME" "$HEALTH_NAME"; do
    if launchctl list | grep -q "$plist"; then
        echo "🔄 更新现有定时任务: $plist..."
        launchctl unload "$LAUNCHD_DIR/$plist.plist" 2>/dev/null || true
    fi
done

# 加载定时任务
echo "⏰ 安装定时任务..."
launchctl load "$LAUNCHD_DIR/$PLIST_NAME.plist"
launchctl load "$LAUNCHD_DIR/$HEALTH_NAME.plist"
echo "✅ 定时任务已安装"
echo ""

# 显示信息
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    ✅ 安装完成！                           ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  📦 Watchdog (自动更新)                                    ║"
echo "║     时间: 每周日 09:00                                     ║"
echo "║     脚本: $SCRIPTS_DIR/openclaw-watchdog.sh"
echo "║     日志: $LOGS_DIR/openclaw-watchdog.log"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  🏥 Health Monitor (健康监控)                              ║"
echo "║     时间: 每天 09:00                                       ║"
echo "║     脚本: $SCRIPTS_DIR/health-monitor.sh"
echo "║     日志: $LOGS_DIR/openclaw-health.log"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  手动运行:                                                 ║"
echo "║    $SCRIPTS_DIR/openclaw-watchdog.sh"
echo "║    $SCRIPTS_DIR/health-monitor.sh"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 询问是否立即运行
read -p "是否立即运行健康检查？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🏥 运行健康检查..."
    "$SCRIPTS_DIR/health-monitor.sh"
fi
