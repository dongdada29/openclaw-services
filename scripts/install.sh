#!/bin/bash
# OpenClaw Services 一键安装脚本
#
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/dongdada29/openclaw-services/main/scripts/install.sh | bash
#
# 或本地安装:
#   bash scripts/install.sh

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

# 配置
OPENCLAW_SERVICES_HOME="${OPENCLAW_SERVICES_HOME:-$HOME/.openclaw/services}"
REPO_URL="https://github.com/dongdada29/openclaw-services"
TEMP_DIR="/tmp/openclaw-services-install-$$"
VERSION="1.0.0"

# 获取当前用户名
USERNAME=$(whoami)

# 检测系统
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║        🦀 OpenClaw Services - 一键安装                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# 清理函数
cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo -e "${CYAN}📋 系统信息:${RESET}"
echo "   系统: $OS"
echo "   架构: $ARCH"
echo "   用户: $USERNAME"
echo ""

# 检查 OpenClaw
echo -e "${CYAN}🔍 检查 OpenClaw...${RESET}"
if command -v openclaw &> /dev/null; then
    VERSION=$(openclaw --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✅ OpenClaw 已安装 (版本: $VERSION)${RESET}"
else
    echo -e "${YELLOW}⚠️ OpenClaw 未安装${RESET}"
    echo "   建议安装: npm install -g openclaw"
fi

echo ""

# 创建目录结构
echo -e "${CYAN}📁 创建安装目录...${RESET}"

mkdir -p "$OPENCLAW_SERVICES_HOME"/{bin,config,logs,data/backups,launchd}

echo -e "${GREEN}✅ 目录已创建${RESET}"
echo "   $OPENCLAW_SERVICES_HOME"
echo ""

# 获取源码
echo -e "${CYAN}📦 获取源码...${RESET}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -d "$SCRIPT_DIR/../.git" ]; then
    # 从本地安装
    echo "从本地源码安装..."
    SOURCE_DIR="$SCRIPT_DIR/.."
else
    # 从 GitHub 克隆
    echo "从 GitHub 克隆..."
    git clone --depth 1 "$REPO_URL" "$TEMP_DIR"
    SOURCE_DIR="$TEMP_DIR"
fi

echo -e "${GREEN}✅ 源码已准备${RESET}"
echo ""

# 检查是否有预编译的二进制
DIST_DIR="$SOURCE_DIR/dist"
BIN_DIR="$OPENCLAW_SERVICES_HOME/bin"

if [ -f "$DIST_DIR/openclaw-services" ]; then
    # 使用预编译的二进制
    echo -e "${CYAN}📦 复制预编译二进制...${RESET}"
    cp "$DIST_DIR/openclaw-services" "$BIN_DIR/"
    cp "$DIST_DIR/openclaw-proxy" "$BIN_DIR/"
    cp "$DIST_DIR/openclaw-watchdog" "$BIN_DIR/"
    chmod +x "$BIN_DIR"/openclaw-*
else
    # 需要构建
    echo -e "${CYAN}🔨 构建二进制...${RESET}"

    # 检查 bun
    if ! command -v bun &> /dev/null; then
        echo -e "${YELLOW}⚠️ Bun 未安装，尝试安装...${RESET}"
        curl -fsSL https://bun.sh/install | bash
        export PATH="$HOME/.bun/bin:$PATH"
    fi

    echo "   使用 Bun $(bun --version)"
    cd "$SOURCE_DIR"
    bash scripts/build.sh

    # 复制构建产物
    cp "$SOURCE_DIR/dist/openclaw-services" "$BIN_DIR/"
    cp "$SOURCE_DIR/dist/openclaw-proxy" "$BIN_DIR/"
    cp "$SOURCE_DIR/dist/openclaw-watchdog" "$BIN_DIR/"
    chmod +x "$BIN_DIR"/openclaw-*
fi

echo -e "${GREEN}✅ 二进制已安装${RESET}"
echo ""

# 复制配置文件
echo -e "${CYAN}📋 复制配置文件...${RESET}"

if [ -d "$SOURCE_DIR/config" ]; then
    cp -r "$SOURCE_DIR/config"/* "$OPENCLAW_SERVICES_HOME/config/" 2>/dev/null || true
fi

# 复制并处理 launchd 配置
for plist in "$SOURCE_DIR/launchd"/*.plist; do
    if [ -f "$plist" ]; then
        filename=$(basename "$plist")
        sed "s|/Users/USERNAME|/Users/$USERNAME|g" "$plist" > "$OPENCLAW_SERVICES_HOME/launchd/$filename"
    fi
done

echo -e "${GREEN}✅ 配置已复制${RESET}"
echo ""

# 创建 CLI 符号链接
echo -e "${CYAN}🔗 创建命令链接...${RESET}"

LOCAL_BIN="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN"

ln -sf "$BIN_DIR/openclaw-services" "$LOCAL_BIN/openclaw-services"

# 添加到 PATH
if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
    echo ""
    echo -e "${YELLOW}⚠️ 请将以下内容添加到你的 shell 配置 (~/.zshrc 或 ~/.bashrc):${RESET}"
    echo ""
    echo '    export PATH="$HOME/.local/bin:$PATH"'
    echo ""
fi

echo -e "${GREEN}✅ CLI 已安装: openclaw-services${RESET}"
echo ""

# 备份现有配置
echo -e "${CYAN}💾 备份配置...${RESET}"

MODELS_FILE="$HOME/.openclaw/agents/main/agent/models.json"
BACKUP_FILE="$OPENCLAW_SERVICES_HOME/data/openclaw-models-original.json"

if [ -f "$MODELS_FILE" ] && [ ! -f "$BACKUP_FILE" ]; then
    cp "$MODELS_FILE" "$BACKUP_FILE"
    echo -e "${GREEN}✅ 已备份 OpenClaw 配置${RESET}"
elif [ -f "$BACKUP_FILE" ]; then
    echo -e "${CYAN}ℹ️  备份已存在${RESET}"
else
    echo -e "${YELLOW}⚠️ 未找到 OpenClaw 配置${RESET}"
fi

echo ""

# 启动 proxy
echo -e "${CYAN}🚀 启动服务...${RESET}"

"$BIN_DIR/openclaw-services" start proxy

echo ""

# 完成
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    ✅ 安装完成！                           ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║                                                            ║"
echo "║  📦 服务目录: $OPENCLAW_SERVICES_HOME"
echo "║  📋 日志目录: $OPENCLAW_SERVICES_HOME/logs"
echo "║  📁 二进制:   $BIN_DIR"
echo "║                                                            ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  快速开始:                                                 ║"
echo "║                                                            ║"
echo "║    openclaw-services status       查看服务状态             ║"
echo "║    openclaw-services proxy enable 启用 proxy 模式          ║"
echo "║    openclaw-services doctor       健康检查                 ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# 询问是否启用 proxy 模式
echo ""
read -p "是否立即启用 proxy 模式？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    "$BIN_DIR/openclaw-services" proxy enable
fi
