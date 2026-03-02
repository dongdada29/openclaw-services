#!/bin/bash
# OpenClaw Health Monitor - 健康监控
# 使用 OpenClaw 内置 health/doctor 命令

# 设置 PATH（launchd 环境需要）
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# 配置（支持环境变量覆盖，默认使用 monorepo 路径）
OPENCLAW_SERVICES_HOME="${OPENCLAW_SERVICES_HOME:-$HOME/.openclaw}"
LOG_DIR="$OPENCLAW_SERVICES_HOME/logs"
LOG_FILE="$LOG_DIR/openclaw-health.log"

# 确保目录存在
mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
    # 设置日志文件权限
    chmod 600 "$LOG_FILE" 2>/dev/null
}

log "=== OpenClaw Health Monitor Started ==="

# 1. 运行 openclaw doctor（自动修复）
log "运行健康检查..."
if openclaw doctor 2>&1 | tee -a "$LOG_FILE"; then
    log "✅ 健康检查通过"
else
    log "⚠️ 发现问题，请查看日志"
fi

# 2. 检查 Gateway 状态
log ""
log "检查 Gateway 状态..."
if openclaw gateway status > /dev/null 2>&1; then
    log "✅ Gateway 正常运行"
else
    log "⚠️ Gateway 状态异常，尝试重启..."
    openclaw gateway restart 2>&1 | tee -a "$LOG_FILE"
    sleep 5

    if openclaw gateway status > /dev/null 2>&1; then
        log "✅ Gateway 已恢复"
    else
        log "❌ Gateway 仍然失败"
    fi
fi

# 3. 检查 model-proxy 状态
log ""
log "检查 model-proxy 状态..."
PROXY_HEALTH_URL="http://localhost:3456/_health"
if curl -s --max-time 5 "$PROXY_HEALTH_URL" > /dev/null 2>&1; then
    log "✅ model-proxy 正常运行"
else
    log "⚠️ model-proxy 无响应"
fi

# 4. 清理旧日志（保留 7 天，仅清理 openclaw 相关日志）
log ""
log "清理旧日志..."
find "$LOG_DIR" -name "openclaw-*.log" -mtime +7 -delete 2>/dev/null
find "$LOG_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null
log "✅ 清理完成"

log ""
log "=== Health Check Complete ==="
echo "---" >> "$LOG_FILE"
