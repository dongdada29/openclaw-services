#!/bin/bash
# OpenClaw 通知系统
# 支持 macOS 通知和 Discord webhook

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# 配置
OPENCLAW_SERVICES_HOME="${OPENCLAW_SERVICES_HOME:-$HOME/.openclaw}"
NOTIFICATION_LOG="$OPENCLAW_SERVICES_HOME/logs/openclaw-notifications.log"
DISCORD_WEBHOOK_FILE="$OPENCLAW_SERVICES_HOME/data/discord-webhook.txt"

# 日志
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$NOTIFICATION_LOG"
}

# macOS 通知
notify_macos() {
    local title="$1"
    local message="$2"
    local sound="${3:-default}"
    
    osascript -e "display notification \"$message\" with title \"$title\" sound name \"$sound\"" 2>/dev/null
}

# Discord 通知
notify_discord() {
    local title="$1"
    local message="$2"
    local level="${3:-info}"  # info, warning, error
    
    if [ -f "$DISCORD_WEBHOOK_FILE" ]; then
        local webhook_url=$(cat "$DISCORD_WEBHOOK_FILE")
        
        local color=3447003  # 蓝色
        [ "$level" = "warning" ] && color=16776960  # 黄色
        [ "$level" = "error" ] && color=15158332    # 红色
        
        curl -s -X POST "$webhook_url" \
            -H "Content-Type: application/json" \
            -d "{
                \"embeds\": [{
                    \"title\": \"$title\",
                    \"description\": \"$message\",
                    \"color\": $color,
                    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
                }]
            }" > /dev/null 2>&1
        
        log "Discord 通知已发送: $title"
    fi
}

# 统一通知接口
notify() {
    local title="$1"
    local message="$2"
    local level="${3:-info}"
    local channels="${4:-macos,discord}"
    
    log "[$level] $title: $message"
    
    # macOS 通知
    if [[ "$channels" == *"macos"* ]]; then
        notify_macos "$title" "$message" "$level"
    fi
    
    # Discord 通知
    if [[ "$channels" == *"discord"* ]]; then
        notify_discord "$title" "$message" "$level"
    fi
}

# 命令行接口
case "${1:-}" in
    send)
        notify "${2:-OpenClaw}" "${3:-}" "${4:-info}" "${5:-macos,discord}"
        ;;
    setup)
        echo "设置 Discord Webhook..."
        echo "请输入 Webhook URL:"
        read -r webhook_url
        mkdir -p "$(dirname "$DISCORD_WEBHOOK_FILE")"
        echo "$webhook_url" > "$DISCORD_WEBHOOK_FILE"
        chmod 600 "$DISCORD_WEBHOOK_FILE"
        echo "✅ 已保存到 $DISCORD_WEBHOOK_FILE"
        ;;
    test)
        notify "测试通知" "这是一条测试消息" "info" "macos,discord"
        ;;
    *)
        echo "用法: $0 <send|setup|test> [title] [message] [level] [channels]"
        echo ""
        echo "命令:"
        echo "  send <title> <message> [level] [channels]  - 发送通知"
        echo "  setup                                      - 设置 Discord Webhook"
        echo "  test                                       - 发送测试通知"
        echo ""
        echo "级别: info, warning, error"
        echo "渠道: macos, discord, macos,discord"
        ;;
esac
