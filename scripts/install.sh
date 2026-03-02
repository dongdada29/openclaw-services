#!/bin/bash
# OpenClaw Services 一键安装脚本
#
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/dongdada29/openclaw-services/main/scripts/install.sh | bash
#   curl -fsSL ... | bash -s -- v1.0.0  # 指定版本
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
OPENCLAW_SERVICES_HOME="${OPENCLAW_SERVICES_HOME:-$HOME/.openclaw}"
REPO_URL="https://github.com/dongdada29/openclaw-services"
TEMP_DIR="/tmp/openclaw-services-install-$$"
USERNAME=$(whoami)
REQUESTED_VERSION="${1:-}"

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
mkdir -p "$OPENCLAW_SERVICES_HOME"/{services,config,logs,data/backups,launchd}
echo -e "${GREEN}✅ 目录已创建${RESET}"
echo "   $OPENCLAW_SERVICES_HOME"
echo ""

# 获取最新版本号
get_latest_version() {
    curl -s "https://api.github.com/repos/dongdada29/openclaw-services/releases/latest" | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/'
}

# 下载发布包
download_release() {
    local version="$1"
    # 去掉版本号前的 v 前缀（如果存在）
    version="${version#v}"
    local tarball="openclaw-services-$version-$OS-$ARCH.tar.gz"
    local download_url="$REPO_URL/releases/download/v$version/$tarball"

    echo -e "${CYAN}📦 下载发布包 v$version...${RESET}"
    echo "   $download_url"

    mkdir -p "$TEMP_DIR"

    if ! curl -fsSL "$download_url" -o "$TEMP_DIR/$tarball"; then
        echo -e "${YELLOW}⚠️ 下载失败，尝试从源码安装...${RESET}"
        return 1
    fi

    # 解压
    echo "   解压..."
    tar -xzf "$TEMP_DIR/$tarball" -C "$TEMP_DIR"

    # 复制文件
    echo "   安装..."
    cp -r "$TEMP_DIR/openclaw-services-$version"/* "$OPENCLAW_SERVICES_HOME/"

    return 0
}

# 从源码安装（备用方案）
install_from_source() {
    echo -e "${CYAN}📦 从源码安装...${RESET}"

    # 检测脚本位置（可能是本地或通过 curl 管道运行）
    if [ -n "${BASH_SOURCE[0]}" ]; then
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    else
        SCRIPT_DIR=""
    fi

    if [ -n "$SCRIPT_DIR" ] && [ -d "$SCRIPT_DIR/../.git" ]; then
        echo "从本地源码安装..."
        SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
    else
        echo "从 GitHub 克隆..."
        git clone --depth 1 "$REPO_URL" "$TEMP_DIR"
        SOURCE_DIR="$TEMP_DIR"
    fi

    # 复制 CLI
    echo "  复制 CLI..."
    cp -r "$SOURCE_DIR/cli" "$OPENCLAW_SERVICES_HOME/"

    # 复制 services
    cp -r "$SOURCE_DIR/services"/* "$OPENCLAW_SERVICES_HOME/services/"

    # 复制 config
    [ -d "$SOURCE_DIR/config" ] && cp -r "$SOURCE_DIR/config"/* "$OPENCLAW_SERVICES_HOME/config/"

    # 复制 launchd 并替换 USERNAME
    for plist in "$SOURCE_DIR/launchd"/*.plist; do
        [ -f "$plist" ] && sed "s|/Users/USERNAME|/Users/$USERNAME|g" "$plist" > "$OPENCLAW_SERVICES_HOME/launchd/$(basename "$plist")"
    done
}

# 安装
if [ -n "$REQUESTED_VERSION" ]; then
    # 指定版本
    download_release "$REQUESTED_VERSION" || install_from_source
else
    # 尝试获取最新版本
    LATEST_VERSION=$(get_latest_version 2>/dev/null || echo "")
    if [ -n "$LATEST_VERSION" ]; then
        echo -e "${CYAN}📌 最新版本: v$LATEST_VERSION${RESET}"
        download_release "$LATEST_VERSION" || install_from_source
    else
        install_from_source
    fi
fi

echo -e "${GREEN}✅ 文件已安装${RESET}"
echo ""

# 安装依赖
echo -e "${CYAN}📦 安装依赖...${RESET}"
PROXY_DIR="$OPENCLAW_SERVICES_HOME/services/model-proxy"
if [ -f "$PROXY_DIR/package.json" ]; then
    cd "$PROXY_DIR"
    if command -v pnpm &> /dev/null; then
        pnpm install --prod
    else
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

# 删除旧的符号链接（如果存在）
[ -L "$BIN_DIR/openclaw-services" ] && rm -f "$BIN_DIR/openclaw-services"

cat > "$BIN_DIR/openclaw-services" << EOF
#!/bin/bash
export OPENCLAW_SERVICES_HOME="$OPENCLAW_SERVICES_HOME"
node "$CLI_TARGET" "\$@"
EOF
chmod +x "$BIN_DIR/openclaw-services"

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo ""
    echo -e "${YELLOW}⚠️ 请将以下内容添加到你的 shell 配置 (~/.zshrc 或 ~/.bashrc):${RESET}"
    echo ""
    echo '    export PATH="$HOME/.local/bin:$PATH"'
    echo ""
fi

echo -e "${GREEN}✅ CLI 已安装: openclaw-services${RESET}"
echo ""

# 备份配置
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

# 询问是否启用 proxy 模式（仅在交互模式下）
if [ -t 0 ]; then
    read -p "是否立即启用 proxy 模式？(y/n) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] && "$BIN_DIR/openclaw-services" proxy enable
fi
