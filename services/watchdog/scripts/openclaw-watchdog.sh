#!/bin/bash
# OpenClaw Watchdog - 智能守护
#
# 功能:
#   1. 自动更新 OpenClaw（每周日）
#   2. 保护 model-proxy 配置
#   3. 检测 proxy 故障并自动抢救
#   4. 配置备份与恢复
#   5. 统一通知系统

# 设置 PATH（launchd 环境需要）
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 配置（支持环境变量覆盖，默认使用 monorepo 路径）
OPENCLAW_SERVICES_HOME="${OPENCLAW_SERVICES_HOME:-$HOME/.openclaw}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE:-$HOME/workspace}"

# 路径配置
LOG_DIR="$OPENCLAW_SERVICES_HOME/logs"
DATA_DIR="$OPENCLAW_SERVICES_HOME/data"
LOG_FILE="$LOG_DIR/openclaw-watchdog.log"
VERSION_FILE="$DATA_DIR/openclaw-version.txt"
CONFIG_BACKUP="$DATA_DIR/backups/openclaw-config-backup.tar.gz"
PROXY_PORT=3456
PROXY_HEALTH_URL="http://localhost:$PROXY_PORT/_health"
PROXY_DIR="$OPENCLAW_SERVICES_HOME/services/model-proxy"
MODELS_FILE="$HOME/.openclaw/agents/main/agent/models.json"
PROXY_CONFIG_BACKUP="$DATA_DIR/openclaw-models-original.json"
RECOVERY_FLAG="$DATA_DIR/.proxy-recovery-mode"
NOTIFY_SCRIPT="$OPENCLAW_SERVICES_HOME/services/watchdog/scripts/openclaw-notify.sh"
PROXY_PID_FILE="/tmp/openclaw-model-proxy.pid"

# 确保目录存在
mkdir -p "$LOG_DIR" "$DATA_DIR/backups"

# 通知函数
send_notify() {
    local title="$1"
    local message="$2"
    local level="${3:-info}"

    if [ -x "$NOTIFY_SCRIPT" ]; then
        "$NOTIFY_SCRIPT" send "$title" "$message" "$level" "macos,discord"
    fi
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
    # 设置日志文件权限，防止敏感信息泄露
    chmod 600 "$LOG_FILE" 2>/dev/null
}

# 检测 model-proxy 是否运行
check_model_proxy() {
    if curl -s --max-time 5 "$PROXY_HEALTH_URL" > /dev/null 2>&1; then
        return 0  # proxy 正常
    else
        return 1  # proxy 故障
    fi
}

# 保存原始配置
backup_original_config() {
    if [ -f "$MODELS_FILE" ] && [ ! -f "$PROXY_CONFIG_BACKUP" ]; then
        cp "$MODELS_FILE" "$PROXY_CONFIG_BACKUP"
        log "✅ 已备份原始 models.json"
    fi
}

# 恢复直连配置
restore_direct_connection() {
    if [ -f "$PROXY_CONFIG_BACKUP" ]; then
        log "⚠️ 恢复直连配置..."
        cp "$PROXY_CONFIG_BACKUP" "$MODELS_FILE"
        log "✅ 已恢复原始配置"

        # 重启 Gateway
        openclaw gateway restart 2>&1 | tee -a "$LOG_FILE"
        log "✅ Gateway 已重启"

        # 标记为恢复模式
        echo "$(date '+%Y-%m-%d %H:%M:%S')" > "$RECOVERY_FLAG"

        # 发送通知
        send_notify "OpenClaw Proxy 故障" "model-proxy 无响应，已切换到直连模式" "warning"
    fi
}

# 尝试重启 proxy
restart_proxy() {
    log "🔄 尝试重启 model-proxy..."

    # 检查 proxy 目录是否存在
    if [ ! -d "$PROXY_DIR" ]; then
        log "❌ Proxy 目录不存在: $PROXY_DIR"
        return 1
    fi

    # 使用 PID 文件锁定，避免竞态条件
    if [ -f "$PROXY_PID_FILE" ]; then
        OLD_PID=$(cat "$PROXY_PID_FILE" 2>/dev/null)
        if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
            log "⚠️ Proxy 正在启动中 (PID: $OLD_PID)，等待..."
            sleep 3
            if check_model_proxy; then
                log "✅ model-proxy 已由其他进程启动"
                return 0
            fi
        fi
        # 清理过期的 PID 文件
        rm -f "$PROXY_PID_FILE"
    fi

    # 先停止旧进程
    pkill -f "node.*model-proxy" 2>/dev/null || true
    sleep 2

    # 创建 PID 文件锁
    echo $$ > "$PROXY_PID_FILE"

    # 启动新进程
    cd "$PROXY_DIR"
    nohup node server.js > "$LOG_DIR/model-proxy.log" 2>&1 &
    PROXY_PID=$!
    echo "$PROXY_PID" > "$PROXY_PID_FILE"
    sleep 3

    # 检查是否启动成功
    if check_model_proxy; then
        log "✅ model-proxy 重启成功 (PID: $PROXY_PID)"
        # 清除恢复标记
        rm -f "$RECOVERY_FLAG"
        # 发送通知
        send_notify "OpenClaw Proxy 恢复" "model-proxy 已成功重启" "info"
        return 0
    else
        log "❌ model-proxy 重启失败"
        rm -f "$PROXY_PID_FILE"
        send_notify "OpenClaw Proxy 重启失败" "无法重启 model-proxy，请手动检查" "error"
        return 1
    fi
}

# 检查并保护 model-proxy
protect_model_proxy() {
    log "检查 model-proxy 状态..."

    if check_model_proxy; then
        log "✅ model-proxy 正常运行"

        # 如果之前在恢复模式，现在 proxy 恢复了，询问是否切回
        if [ -f "$RECOVERY_FLAG" ]; then
            log "ℹ️ 检测到 proxy 已恢复，可手动切换回 proxy 模式:"
            log "   openclaw-services proxy enable"
            send_notify "OpenClaw Proxy 可用" "model-proxy 已恢复，可切换回 proxy 模式" "info"
        fi
    else
        log "⚠️ model-proxy 无响应"

        # 先恢复直连，保证 OpenClaw 可用
        restore_direct_connection

        # 尝试重启 proxy
        restart_proxy
    fi
}

# 主流程
log "╔════════════════════════════════════════════════════════════╗"
log "║              OpenClaw Watchdog Started                     ║"
log "╚════════════════════════════════════════════════════════════╝"

# 1. 备份原始配置
backup_original_config

# 2. 检查 model-proxy 状态
protect_model_proxy

# 3. 记录当前版本
CURRENT_VERSION=$(openclaw --version 2>/dev/null)
log "当前版本: $CURRENT_VERSION"
echo "$CURRENT_VERSION" > "$VERSION_FILE"

# 4. 备份配置
log "备份配置..."
tar -czf "$CONFIG_BACKUP" -C ~ .openclaw 2>/dev/null && \
    log "✅ 配置已备份" || \
    log "⚠️ 配置备份失败"

# 5. 尝试升级
log "开始升级 OpenClaw..."
npm update -g openclaw 2>&1 | tee -a "$LOG_FILE"
sleep 3

# 6. 测试新版本
NEW_VERSION=$(openclaw --version 2>/dev/null)
log "新版本: $NEW_VERSION"

if [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
    log "检测到新版本，测试启动..."

    # 测试 Gateway
    if openclaw gateway status > /dev/null 2>&1; then
        log "✅ 升级成功! Gateway 正常运行"
    else
        log "⚠️ Gateway 启动失败，尝试修复..."
        openclaw gateway restart 2>&1 | tee -a "$LOG_FILE"
        sleep 5

        if openclaw gateway status > /dev/null 2>&1; then
            log "✅ Gateway 重启成功"
        else
            log "❌ Gateway 仍然失败，开始回滚..."

            # 回滚
            log "回滚到版本: $CURRENT_VERSION"
            npm install -g "openclaw@$CURRENT_VERSION" 2>&1 | tee -a "$LOG_FILE"
            sleep 3

            # 恢复配置
            log "恢复配置..."
            tar -xzf "$CONFIG_BACKUP" -C ~ 2>/dev/null

            # 重启 Gateway
            openclaw gateway restart 2>&1 | tee -a "$LOG_FILE"
            log "✅ 回滚完成"
        fi
    fi
else
    log "ℹ️ 已是最新版本，无需升级"
fi

# 7. 再次检查 model-proxy
protect_model_proxy

log "╔════════════════════════════════════════════════════════════╗"
log "║              Watchdog Finished                             ║"
log "╚════════════════════════════════════════════════════════════╝"
echo "---" >> "$LOG_FILE"
