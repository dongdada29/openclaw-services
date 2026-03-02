#!/bin/bash
# OpenClaw Services - 构建脚本
# 使用 Bun 编译为单文件二进制

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version" 2>/dev/null || echo "1.0.0")

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║        🏗️  OpenClaw Services Build                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

echo -e "${CYAN}📦 构建配置:${RESET}"
echo "   版本: $VERSION"
echo "   平台: $(uname -s) ($(uname -m))"
echo ""

# 检查 bun
if ! command -v bun &> /dev/null; then
    echo -e "${RED}❌ Bun 未安装${RESET}"
    echo "   请安装: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

echo -e "${GREEN}✅ Bun $(bun --version)${RESET}"
echo ""

# 清理
echo -e "${CYAN}🧹 清理构建目录...${RESET}"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# 构建二进制
echo -e "${CYAN}🔨 编译二进制...${RESET}"

cd "$PROJECT_ROOT"

# 主入口 - CLI
echo "  编译 CLI..."
bun build "$PROJECT_ROOT/cli/src/index.js" \
    --compile \
    --outfile="$DIST_DIR/openclaw-services"

# Proxy 服务
echo "  编译 Proxy..."
bun build "$PROJECT_ROOT/services/model-proxy/server.js" \
    --compile \
    --outfile="$DIST_DIR/openclaw-proxy"

# Watchdog 服务
echo "  编译 Watchdog..."
bun build "$PROJECT_ROOT/services/watchdog/index.js" \
    --compile \
    --outfile="$DIST_DIR/openclaw-watchdog"

echo ""

# 复制配置文件
echo -e "${CYAN}📋 复制配置文件...${RESET}"

mkdir -p "$DIST_DIR/config"
cp "$PROJECT_ROOT/config/openclaw.toml" "$DIST_DIR/config/" 2>/dev/null || true

mkdir -p "$DIST_DIR/launchd"
cp "$PROJECT_ROOT/launchd/"*.plist "$DIST_DIR/launchd/"

# 设置权限
chmod +x "$DIST_DIR/openclaw-services"
chmod +x "$DIST_DIR/openclaw-proxy"
chmod +x "$DIST_DIR/openclaw-watchdog"

# 显示结果
echo ""
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    ✅ 构建完成！                           ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║                                                            ║"
ls -lh "$DIST_DIR"/*.{toml,} 2>/dev/null | while read line; do
    echo "║  $line"
done
ls -lh "$DIST_DIR"/openclaw-* 2>/dev/null | while read line; do
    echo "║  $line"
done
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# 测试
echo ""
echo -e "${CYAN}🧪 测试二进制...${RESET}"
"$DIST_DIR/openclaw-services" --version

echo ""
echo -e "${GREEN}✅ 构建成功！输出目录: $DIST_DIR${RESET}"
