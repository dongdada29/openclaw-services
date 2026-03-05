#!/bin/bash
# OpenClaw Services 一键安装/更新脚本
#
# 用法:
#   bash scripts/install.sh           # 安装/更新
#   bash scripts/install.sh --update  # 从本地源码更新
#   bash scripts/install.sh --setup   # 仅运行 setup
#
# 远程安装:
#   curl -fsSL https://raw.githubusercontent.com/dongdada29/openclaw-services/main/scripts/install.sh | bash

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

# 检测系统
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# 解析参数
MODE="install"
for arg in "$@"; do
  case $arg in
    --update) MODE="update" ;;
    --setup) MODE="setup" ;;
  esac
done

# 检测脚本位置
if [ -n "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  SOURCE_DIR="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd)"
else
  SCRIPT_DIR=""
  SOURCE_DIR=""
fi

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║        🦞 OpenClaw Services - 一键安装/更新                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# 清理函数
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# 检查依赖
check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}❌ $1 未安装${RESET}"
    echo "   请先安装: $2"
    return 1
  fi
  echo -e "${GREEN}✅ $1 已安装${RESET}"
  return 0
}

# 从本地源码安装
install_from_local() {
  echo -e "${CYAN}📦 从本地源码安装...${RESET}"
  echo "   源码目录: $SOURCE_DIR"

  if [ ! -d "$SOURCE_DIR/.git" ]; then
    echo -e "${RED}❌ 未找到 Git 仓库${RESET}"
    return 1
  fi

  # 创建目录结构
  mkdir -p "$OPENCLAW_SERVICES_HOME"/{services,config,logs,data/backups}

  # 复制 CLI
  echo "   复制 CLI..."
  mkdir -p "$OPENCLAW_SERVICES_HOME/cli/src"
  cp "$SOURCE_DIR/cli/src/index.js" "$OPENCLAW_SERVICES_HOME/cli/src/"

  # 复制 services
  echo "   复制 services..."
  mkdir -p "$OPENCLAW_SERVICES_HOME/services/model-proxy/src"
  mkdir -p "$OPENCLAW_SERVICES_HOME/services/watchdog/scripts"

  # model-proxy
  cp "$SOURCE_DIR/services/model-proxy/server.js" "$OPENCLAW_SERVICES_HOME/services/model-proxy/"
  cp "$SOURCE_DIR/services/model-proxy/config.toml" "$OPENCLAW_SERVICES_HOME/services/model-proxy/"
  cp -r "$SOURCE_DIR/services/model-proxy/src/"* "$OPENCLAW_SERVICES_HOME/services/model-proxy/src/" 2>/dev/null || true

  # watchdog
  cp "$SOURCE_DIR/services/watchdog/index.js" "$OPENCLAW_SERVICES_HOME/services/watchdog/" 2>/dev/null || true
  cp -r "$SOURCE_DIR/services/watchdog/scripts/"* "$OPENCLAW_SERVICES_HOME/services/watchdog/scripts/" 2>/dev/null || true

  # 复制 package.json (用于依赖安装)
  [ -f "$SOURCE_DIR/services/model-proxy/package.json" ] && \
    cp "$SOURCE_DIR/services/model-proxy/package.json" "$OPENCLAW_SERVICES_HOME/services/model-proxy/"

  echo -e "${GREEN}✅ 文件已复制${RESET}"
  return 0
}

# 从 GitHub 克隆
install_from_github() {
  echo -e "${CYAN}📦 从 GitHub 克隆...${RESET}"

  git clone --depth 1 "$REPO_URL" "$TEMP_DIR"
  SOURCE_DIR="$TEMP_DIR"

  # 创建目录结构
  mkdir -p "$OPENCLAW_SERVICES_HOME"/{services,config,logs,data/backups}

  # 复制文件
  cp -r "$SOURCE_DIR/cli" "$OPENCLAW_SERVICES_HOME/"
  cp -r "$SOURCE_DIR/services"/* "$OPENCLAW_SERVICES_HOME/services/"

  echo -e "${GREEN}✅ 文件已复制${RESET}"
  return 0
}

# 安装依赖
install_deps() {
  echo -e "${CYAN}📦 安装依赖...${RESET}"

  PROXY_DIR="$OPENCLAW_SERVICES_HOME/services/model-proxy"
  if [ -f "$PROXY_DIR/package.json" ]; then
    cd "$PROXY_DIR"
    if command -v pnpm &> /dev/null; then
      pnpm install --prod 2>/dev/null || npm install --omit=dev
    else
      npm install --omit=dev
    fi
  fi

  echo -e "${GREEN}✅ 依赖已安装${RESET}"
}

# 创建 CLI 命令
create_cli() {
  echo -e "${CYAN}🔗 创建 CLI 命令...${RESET}"

  CLI_TARGET="$OPENCLAW_SERVICES_HOME/cli/src/index.js"
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"

  cat > "$BIN_DIR/openclaw-services" << EOF
#!/bin/bash
export OPENCLAW_SERVICES_HOME="$OPENCLAW_SERVICES_HOME"
node "$CLI_TARGET" "\$@"
EOF
  chmod +x "$BIN_DIR/openclaw-services"

  echo -e "${GREEN}✅ CLI 已安装: openclaw-services${RESET}"

  if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo -e "${YELLOW}⚠️ 请将以下内容添加到 ~/.zshrc:${RESET}"
    echo '    export PATH="$HOME/.local/bin:$PATH"'
  fi
}

# 运行 setup
run_setup() {
  echo -e "${CYAN}🚀 运行 setup...${RESET}"

  "$HOME/.local/bin/openclaw-services" setup
}

# 主流程
main() {
  # 检查依赖
  echo -e "${CYAN}🔍 检查依赖...${RESET}"
  MISSING_DEPS=0
  check_command "node" "brew install node" || MISSING_DEPS=1
  check_command "npm" "brew install node" || MISSING_DEPS=1

  if [ $MISSING_DEPS -eq 1 ]; then
    echo -e "${RED}请先安装缺失的依赖${RESET}"
    exit 1
  fi

  # 检查 OpenClaw
  if command -v openclaw &> /dev/null; then
    VERSION=$(openclaw --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✅ OpenClaw 已安装 (版本: $VERSION)${RESET}"
  else
    echo -e "${YELLOW}⚠️ OpenClaw 未安装${RESET}"
    echo "   建议安装: npm install -g openclaw"
  fi
  echo ""

  case $MODE in
    setup)
      # 仅运行 setup
      run_setup
      ;;

    update)
      # 从本地源码更新
      if [ -n "$SOURCE_DIR" ] && [ -d "$SOURCE_DIR/.git" ]; then
        install_from_local
        install_deps
        create_cli
        run_setup
      else
        echo -e "${RED}❌ 未找到本地源码，请先克隆仓库${RESET}"
        echo "   git clone https://github.com/dongdada29/openclaw-services.git"
        exit 1
      fi
      ;;

    install)
      # 完整安装
      if [ -n "$SOURCE_DIR" ] && [ -d "$SOURCE_DIR/.git" ]; then
        # 本地安装
        install_from_local
      else
        # 远程安装
        install_from_github
      fi

      install_deps
      create_cli
      run_setup
      ;;
  esac

  echo -e "${GREEN}"
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║                    ✅ 完成！                               ║"
  echo "╠════════════════════════════════════════════════════════════╣"
  echo "║  服务目录: $OPENCLAW_SERVICES_HOME"
  echo "║  日志目录: $OPENCLAW_SERVICES_HOME/logs"
  echo "╠════════════════════════════════════════════════════════════╣"
  echo "║  常用命令:                                                 ║"
  echo "║    openclaw-services status       状态                     ║"
  echo "║    openclaw-services doctor       检查                     ║"
  echo "║    openclaw-services proxy enable 启用代理                 ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo -e "${RESET}"
}

main "$@"
