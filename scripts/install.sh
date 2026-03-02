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

# 获取当前用户名
USERNAME=$(whoami)

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

# 检查依赖
echo -e "${CYAN}🔍 检查依赖...${RESET}"

check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}❌ $1 未安装${RESET}"
        echo "   请先安装: $2"
        return 1
    fi
    echo -e "${GREEN}✅ $1 已安装${RESET}"
    return 0
}

MISSING_DEPS=0

check_command "node" "brew install node" || MISSING_DEPS=1
check_command "npm" "brew install node" || MISSING_DEPS=1
check_command "git" "brew install git" || MISSING_DEPS=0

if [ $MISSING_DEPS -eq 1 ]; then
    echo -e "${RED}请先安装缺失的依赖${RESET}"
    exit 1
fi

# 检查 OpenClaw
echo ""
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

mkdir -p "$OPENCLAW_SERVICES_HOME"/{services,cli,config,logs,data/backups}

echo -e "${GREEN}✅ 目录已创建${RESET}"
echo "   $OPENCLAW_SERVICES_HOME"
echo ""

# 下载/获取源码
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

# 复制文件到安装目录
echo -e "${CYAN}📦 安装服务...${RESET}"

# 复制 CLI
echo "  复制 CLI..."
cp -r "$SOURCE_DIR/cli"/* "$OPENCLAW_SERVICES_HOME/cli/"

# 复制 services（排除 node_modules）
echo "  复制 services..."
cp -r "$SOURCE_DIR/services"/* "$OPENCLAW_SERVICES_HOME/services/"

# 复制 config
if [ -d "$SOURCE_DIR/config" ]; then
    cp -r "$SOURCE_DIR/config"/* "$OPENCLAW_SERVICES_HOME/config/"
fi

# 复制 launchd 并替换 USERNAME
echo "  复制 launchd 配置..."
mkdir -p "$OPENCLAW_SERVICES_HOME/launchd"
for plist in "$SOURCE_DIR/launchd"/*.plist; do
    if [ -f "$plist" ]; then
        filename=$(basename "$plist")
        sed "s|/Users/USERNAME|/Users/$USERNAME|g" "$plist" > "$OPENCLAW_SERVICES_HOME/launchd/$filename"
    fi
done

echo -e "${GREEN}✅ 服务已安装${RESET}"
echo ""

# 安装依赖
echo -e "${CYAN}📦 安装依赖...${RESET}"

# model-proxy 依赖
PROXY_DIR="$OPENCLAW_SERVICES_HOME/services/model-proxy"
if [ -f "$PROXY_DIR/package.json" ]; then
    echo "  安装 model-proxy 依赖..."
    cd "$PROXY_DIR"
    if command -v pnpm &> /dev/null; then
        pnpm install --prod
    elif command -v npm &> /dev/null; then
        npm install --omit=dev
    fi
fi

echo -e "${GREEN}✅ 依赖已安装${RESET}"
echo ""

# 创建 CLI 命令
echo -e "${CYAN}🔗 创建命令链接...${RESET}"

CLI_TARGET="$OPENCLAW_SERVICES_HOME/cli/src/index.js"
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

if [ -f "$CLI_TARGET" ]; then
    # 创建包装脚本
    cat > "$BIN_DIR/openclaw-services" << EOF
#!/bin/bash
export OPENCLAW_SERVICES_HOME="$OPENCLAW_SERVICES_HOME"
node "$CLI_TARGET" "\$@"
EOF
    chmod +x "$BIN_DIR/openclaw-services"

    # 添加到 PATH
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        echo ""
        echo -e "${YELLOW}⚠️ 请将以下内容添加到你的 shell 配置 (~/.zshrc 或 ~/.bashrc):${RESET}"
        echo ""
        echo '    export PATH="$HOME/.local/bin:$PATH"'
        echo ""
    fi

    echo -e "${GREEN}✅ CLI 已安装: openclaw-services${RESET}"
fi

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

if [ -f "$BIN_DIR/openclaw-services" ]; then
    "$BIN_DIR/openclaw-services" start proxy
else
    echo -e "${YELLOW}⚠️ CLI 未安装，跳过自动启动${RESET}"
    echo "   请手动运行: openclaw-services start proxy"
fi

echo ""

# 完成
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    ✅ 安装完成！                           ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║                                                            ║"
echo "║  📦 服务目录: $OPENCLAW_SERVICES_HOME"
echo "║  📋 日志目录: $OPENCLAW_SERVICES_HOME/logs"
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
    if [ -f "$BIN_DIR/openclaw-services" ]; then
        "$BIN_DIR/openclaw-services" proxy enable
    else
        node "$CLI_TARGET" proxy enable
    fi
fi
