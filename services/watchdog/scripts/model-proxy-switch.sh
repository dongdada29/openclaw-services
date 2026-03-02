#!/bin/bash
# Model Proxy 管理工具
# 用于管理 proxy 模式、状态检查和故障恢复

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# 配置（支持环境变量覆盖，默认使用 monorepo 路径）
OPENCLAW_SERVICES_HOME="${OPENCLAW_SERVICES_HOME:-$HOME/.openclaw/services}"
DATA_DIR="$OPENCLAW_SERVICES_HOME/data"
LOG_DIR="$OPENCLAW_SERVICES_HOME/logs"

PROXY_PORT=3456
PROXY_URL="http://localhost:$PROXY_PORT"
MODELS_FILE="$HOME/.openclaw/agents/main/agent/models.json"
BACKUP_FILE="$DATA_DIR/openclaw-models-original.json"
PROXY_DIR="$OPENCLAW_SERVICES_HOME/services/model-proxy"
RECOVERY_FLAG="$DATA_DIR/.proxy-recovery-mode"
LOG_FILE="$LOG_DIR/model-proxy-switch.log"
NOTIFY_SCRIPT="$OPENCLAW_SERVICES_HOME/services/watchdog/scripts/openclaw-notify.sh"

# 确保目录存在
mkdir -p "$DATA_DIR" "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

usage() {
    cat << EOF
用法: $0 <命令> [选项]

命令:
  status      查看当前状态
  enable      启用 proxy 模式
  disable     禁用 proxy 模式（恢复直连）
  backup      备份当前配置
  test        测试 proxy 是否可用
  restart     重启 proxy 服务
  recover     紧急恢复（直连 + 重启 Gateway）
  watch       持续监控（每 60 秒检查一次）

示例:
  $0 status     # 查看当前配置
  $0 enable     # 切换到 proxy 模式
  $0 disable    # 切换回直连模式
  $0 recover    # 紧急恢复
  $0 watch      # 持续监控

EOF
}

check_proxy() {
    if curl -s --max-time 5 "$PROXY_URL/_health" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

backup_config() {
    if [ -f "$MODELS_FILE" ]; then
        cp "$MODELS_FILE" "$BACKUP_FILE"
        echo "✅ 已备份配置到: $BACKUP_FILE"
    else
        echo "❌ 配置文件不存在: $MODELS_FILE"
        exit 1
    fi
}

enable_proxy() {
    log "🔄 切换到 proxy 模式..."

    # 检查 proxy 是否运行
    if ! check_proxy; then
        echo "⚠️ model-proxy 未运行，尝试启动..."
        start_proxy
        sleep 3

        if ! check_proxy; then
            echo "❌ 无法启动 proxy，请检查日志"
            exit 1
        fi
    fi

    # 备份原始配置
    if [ ! -f "$BACKUP_FILE" ]; then
        backup_config
    fi

    # 读取原始配置，修改 baseUrl（使用正确的路由前缀）
    if [ -f "$MODELS_FILE" ]; then
        # 使用 Python 进行 JSON 处理（更可靠）
        if command -v python3 &> /dev/null; then
            python3 << EOF
import json
import sys

PROXY_URL = "http://localhost:3456"

# Provider 到 proxy 路由前缀的映射
PROVIDER_ROUTES = {
    "zai": "/zai-coding",
    "minimax": "/minimax",
    "claude-proxy": "/claude-proxy",
}

MODELS_FILE = "$MODELS_FILE"

with open(MODELS_FILE, 'r') as f:
    config = json.load(f)

# 修改各 provider 的 baseUrl（使用对应路由前缀）
for provider_name, provider_config in config.get('providers', {}).items():
    if 'baseUrl' in provider_config:
        route = PROVIDER_ROUTES.get(provider_name, "")
        provider_config['baseUrl'] = f"{PROXY_URL}{route}"
        print(f"  {provider_name}: {PROXY_URL}{route}")

with open(MODELS_FILE, 'w') as f:
    json.dump(config, f, indent=2)

print('✅ 已修改所有 provider 的 baseUrl')
EOF
        else
            echo "❌ 需要 Python3 来处理 JSON 配置"
            exit 1
        fi

        echo "✅ 已切换到 proxy 模式"
        echo "   Proxy URL: $PROXY_URL"

        # 清除恢复标记
        rm -f "$RECOVERY_FLAG"

        # 重启 Gateway
        echo "🔄 重启 Gateway..."
        openclaw gateway restart
    else
        echo "❌ 配置文件不存在"
        exit 1
    fi
}

disable_proxy() {
    log "🔄 恢复直连模式..."

    if [ -f "$BACKUP_FILE" ]; then
        cp "$BACKUP_FILE" "$MODELS_FILE"
        echo "✅ 已恢复直连模式"

        # 设置恢复标记
        echo "$(date '+%Y-%m-%d %H:%M:%S')" > "$RECOVERY_FLAG"

        # 重启 Gateway
        echo "🔄 重启 Gateway..."
        openclaw gateway restart
    else
        echo "❌ 备份文件不存在: $BACKUP_FILE"
        echo "   请手动修改 $MODELS_FILE"
        exit 1
    fi
}

show_status() {
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║              Model Proxy 状态                              ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""

    # 检查 proxy 进程
    if check_proxy; then
        echo "Proxy:  ✅ 运行中 ($PROXY_URL)"

        # 显示统计
        echo ""
        echo "统计信息:"
        curl -s "$PROXY_URL/_stats" 2>/dev/null | python3 -m json.tool 2>/dev/null | head -15
    else
        echo "Proxy:  ❌ 未运行"
    fi

    echo ""

    # 检查配置
    if [ -f "$MODELS_FILE" ]; then
        echo "当前 baseUrl:"
        grep -o '"baseUrl": "[^"]*"' "$MODELS_FILE" | head -5 | while read line; do
            echo "  $line"
        done

        echo ""
        if grep -q "localhost:$PROXY_PORT" "$MODELS_FILE"; then
            echo "模式:   🔀 Proxy 模式"
        else
            echo "模式:   🔗 直连模式"
        fi
    fi

    echo ""

    if [ -f "$BACKUP_FILE" ]; then
        BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
        BACKUP_TIME=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$BACKUP_FILE" 2>/dev/null || stat -c "%y" "$BACKUP_FILE" 2>/dev/null | cut -d. -f1)
        echo "备份:   ✅ $BACKUP_FILE ($BACKUP_SIZE, $BACKUP_TIME)"
    else
        echo "备份:   ❌ 无"
    fi

    if [ -f "$RECOVERY_FLAG" ]; then
        RECOVERY_TIME=$(cat "$RECOVERY_FLAG")
        echo ""
        echo "⚠️  恢复模式: 自 $RECOVERY_TIME 起 proxy 故障，已切换到直连"
    fi
}

test_proxy() {
    echo "测试 model-proxy..."
    echo ""

    # 健康检查
    echo "1. 健康检查..."
    if check_proxy; then
        echo "   ✅ Proxy 响应正常"
    else
        echo "   ❌ Proxy 无响应"
        exit 1
    fi

    # 统计检查
    echo ""
    echo "2. 统计端点..."
    STATS=$(curl -s "$PROXY_URL/_stats" 2>/dev/null)
    if [ -n "$STATS" ]; then
        echo "   ✅ 统计端点正常"
        echo "$STATS" | python3 -m json.tool 2>/dev/null | head -10
    else
        echo "   ❌ 统计端点异常"
    fi

    # 供应商检查
    echo ""
    echo "3. 供应商列表..."
    PROVIDERS=$(curl -s "$PROXY_URL/_providers" 2>/dev/null)
    if [ -n "$PROVIDERS" ]; then
        echo "   ✅ 供应商列表正常"
        echo "$PROVIDERS" | python3 -m json.tool 2>/dev/null | grep -E '"id"|"name"' | head -10
    else
        echo "   ❌ 供应商列表异常"
    fi
}

start_proxy() {
    log "🚀 启动 model-proxy..."

    if [ ! -d "$PROXY_DIR" ]; then
        echo "❌ Proxy 目录不存在: $PROXY_DIR"
        return 1
    fi

    cd "$PROXY_DIR"
    nohup node server.js > "$LOG_DIR/model-proxy.log" 2>&1 &
    sleep 3

    if check_proxy; then
        echo "✅ Proxy 启动成功"
        return 0
    else
        echo "❌ Proxy 启动失败"
        return 1
    fi
}

restart_proxy() {
    log "🔄 重启 model-proxy..."

    # 停止
    pkill -f "node.*model-proxy" 2>/dev/null || true
    sleep 2

    # 启动
    start_proxy
}

recover() {
    log "🚨 紧急恢复..."

    # 1. 停止 proxy
    echo "1. 停止 proxy..."
    pkill -f "node.*model-proxy" 2>/dev/null || true
    sleep 2

    # 2. 恢复直连配置
    echo "2. 恢复直连配置..."
    if [ -f "$BACKUP_FILE" ]; then
        cp "$BACKUP_FILE" "$MODELS_FILE"
        echo "   ✅ 配置已恢复"
    else
        echo "   ⚠️ 无备份文件"
    fi

    # 3. 设置恢复标记
    echo "$(date '+%Y-%m-%d %H:%M:%S')" > "$RECOVERY_FLAG"

    # 4. 重启 Gateway
    echo "3. 重启 Gateway..."
    openclaw gateway restart

    # 5. 运行健康检查
    echo "4. 运行健康检查..."
    openclaw doctor

    echo ""
    echo "✅ 紧急恢复完成"
    echo "   现在使用直连模式"
    echo "   修复 proxy 后可运行: $0 enable"
}

watch() {
    # 退避重试配置
    local MAX_RETRIES=5
    local BASE_INTERVAL=60
    local MAX_INTERVAL=600
    local retry_count=0
    local current_interval=$BASE_INTERVAL

    echo "持续监控 model-proxy（退避重试模式，Ctrl+C 停止）..."
    echo "  初始间隔: ${BASE_INTERVAL}s"
    echo "  最大间隔: ${MAX_INTERVAL}s"
    echo "  最大重试: ${MAX_RETRIES} 次"
    echo ""

    while true; do
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

        if check_proxy; then
            echo "[$TIMESTAMP] ✅ Proxy 正常"

            # 重置退避
            if [ $retry_count -gt 0 ]; then
                echo "[$TIMESTAMP] 🔄 重置退避计数器"
                retry_count=0
                current_interval=$BASE_INTERVAL
            fi
        else
            retry_count=$((retry_count + 1))
            echo "[$TIMESTAMP] ❌ Proxy 故障 (重试 $retry_count/$MAX_RETRIES)"

            if [ $retry_count -le $MAX_RETRIES ]; then
                # 尝试恢复
                recover

                # 计算退避间隔（指数退避）
                current_interval=$((BASE_INTERVAL * (2 ** (retry_count - 1))))
                [ $current_interval -gt $MAX_INTERVAL ] && current_interval=$MAX_INTERVAL

                echo "[$TIMESTAMP] ⏳ 等待 ${current_interval}s 后重试..."
            else
                echo "[$TIMESTAMP] 🚨 达到最大重试次数，停止重试"
                echo "[$TIMESTAMP] 请手动检查 proxy 状态"

                # 发送通知
                if [ -x "$NOTIFY_SCRIPT" ]; then
                    "$NOTIFY_SCRIPT" send \
                        "OpenClaw Proxy 故障" \
                        "达到最大重试次数 ($MAX_RETRIES)，请手动检查" \
                        "error"
                fi

                break
            fi
        fi

        sleep $current_interval
    done
}

# 主逻辑
case "${1:-}" in
    status)
        show_status
        ;;
    enable)
        enable_proxy
        ;;
    disable)
        disable_proxy
        ;;
    backup)
        backup_config
        ;;
    test)
        test_proxy
        ;;
    start)
        start_proxy
        ;;
    restart)
        restart_proxy
        ;;
    recover)
        recover
        ;;
    watch)
        watch
        ;;
    *)
        usage
        exit 1
        ;;
esac
