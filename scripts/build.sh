#!/bin/bash
# OpenClaw Services - 构建打包脚本
# 生成可分发的 tarball

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

# 检测系统
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║        🏗️  OpenClaw Services Build                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

echo -e "${CYAN}📦 构建配置:${RESET}"
echo "   版本: $VERSION"
echo "   平台: $OS"
echo "   架构: $ARCH"
echo ""

# 清理
echo -e "${CYAN}🧹 清理构建目录...${RESET}"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/build"

# 构建临时目录
BUILD_DIR="$DIST_DIR/build/openclaw-services-$VERSION"
mkdir -p "$BUILD_DIR"

# 复制必要文件
echo -e "${CYAN}📋 复制文件...${RESET}"

# CLI
echo "  复制 CLI..."
mkdir -p "$BUILD_DIR/cli/src"
cp "$PROJECT_ROOT/cli/src/index.js" "$BUILD_DIR/cli/src/"
cp "$PROJECT_ROOT/cli/package.json" "$BUILD_DIR/cli/"

# Services (model-proxy)
echo "  复制 model-proxy..."
cp -r "$PROJECT_ROOT/services/model-proxy" "$BUILD_DIR/services/"
# 清理 node_modules 和测试文件
rm -rf "$BUILD_DIR/services/model-proxy/node_modules"
rm -rf "$BUILD_DIR/services/model-proxy/tests"
rm -rf "$BUILD_DIR/services/model-proxy/.gitignore"

# Services (watchdog)
echo "  复制 watchdog..."
mkdir -p "$BUILD_DIR/services/watchdog"
cp "$PROJECT_ROOT/services/watchdog/index.js" "$BUILD_DIR/services/watchdog/"
cp -r "$PROJECT_ROOT/services/watchdog/scripts" "$BUILD_DIR/services/watchdog/" 2>/dev/null || true

# Config
echo "  复制 config..."
cp -r "$PROJECT_ROOT/config" "$BUILD_DIR/" 2>/dev/null || mkdir -p "$BUILD_DIR/config"

# Launchd templates
echo "  复制 launchd..."
cp -r "$PROJECT_ROOT/launchd" "$BUILD_DIR/"

# Scripts
echo "  复制 scripts..."
mkdir -p "$BUILD_DIR/scripts"
cp "$PROJECT_ROOT/scripts/install.sh" "$BUILD_DIR/scripts/"

# README
cp "$PROJECT_ROOT/README.md" "$BUILD_DIR/" 2>/dev/null || true

# 创建 tarball
echo ""
echo -e "${CYAN}📦 创建发布包...${RESET}"

TARBALL_NAME="openclaw-services-$VERSION-$OS-$ARCH.tar.gz"
cd "$DIST_DIR/build"
tar -czf "$DIST_DIR/$TARBALL_NAME" "openclaw-services-$VERSION"

# 计算校验和
cd "$DIST_DIR"
if command -v sha256sum &> /dev/null; then
    sha256sum "$TARBALL_NAME" > "$TARBALL_NAME.sha256"
else
    shasum -a 256 "$TARBALL_NAME" > "$TARBALL_NAME.sha256"
fi

# 显示结果
echo ""
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    ✅ 构建完成！                           ║"
echo "╠════════════════════════════════════════════════════════════╣"
ls -lh "$DIST_DIR"/*.tar.gz* 2>/dev/null | while read line; do
    echo "║  $line"
done
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# 清理临时目录
rm -rf "$DIST_DIR/build"

echo -e "${GREEN}✅ 发布包: $DIST_DIR/$TARBALL_NAME${RESET}"
