#!/bin/bash


SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATA_DIR="$SCRIPT_DIR/data"

REDIS_PORT=9530
CHROMA_PORT=9001
CHROMA_HOST="localhost"
CHROMA_PATH="$DATA_DIR/embeddings"
VENV_CHROMA="$PROJECT_ROOT/venv/bin/chroma"

REDIS_PID=""
CHROMA_PID=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}i${NC}  $1"; }
success() { echo -e "${GREEN}+${NC}  $1"; }
warning() { echo -e "${YELLOW}!${NC}  $1"; }
error()   { echo -e "${RED}x${NC}  $1"; }

mkdir -p "$DATA_DIR" "$CHROMA_PATH"

# ── Health checks ─────────────────────────────────────────────────────────────

redis_running() {
    redis-cli -p "$REDIS_PORT" ping > /dev/null 2>&1
}

chroma_running() {
    curl -sf "http://$CHROMA_HOST:$CHROMA_PORT/api/v2/heartbeat" > /dev/null 2>&1
}

wait_for_redis() {
    local retries=20
    while [ $retries -gt 0 ]; do
        redis_running && return 0
        sleep 0.5
        retries=$((retries - 1))
    done
    return 1
}

wait_for_chroma() {
    local retries=30
    while [ $retries -gt 0 ]; do
        chroma_running && return 0
        sleep 0.5
        retries=$((retries - 1))
    done
    return 1
}

# ── Start ─────────────────────────────────────────────────────────────────────

cleanup() {
    echo ""
    info "Shutting down services..."
    [ -n "$CHROMA_PID" ] && kill "$CHROMA_PID" 2>/dev/null && success "Chroma stopped"
    [ -n "$REDIS_PID"  ] && kill "$REDIS_PID"  2>/dev/null && success "Redis stopped"
    wait
    exit 0
}

start_services() {
    trap cleanup INT TERM

    # ── Redis ────────────────────────────────────────────────────────────────
    if redis_running; then
        success "Redis already running on port $REDIS_PORT"
    else
        info "Starting Redis on port $REDIS_PORT..."
        redis-server \
            --port               "$REDIS_PORT" \
            --dir                "$DATA_DIR" \
            --appendonly         yes \
            --maxmemory          2gb \
            --maxmemory-policy   allkeys-lru \
            >> "$DATA_DIR/redis.log" 2>&1 &
        REDIS_PID=$!

        if wait_for_redis; then
            success "Redis started (pid $REDIS_PID)"
        else
            error "Redis failed to start – see $DATA_DIR/redis.log"
            kill "$REDIS_PID" 2>/dev/null
            exit 1
        fi
    fi

    # ── Chroma ───────────────────────────────────────────────────────────────
    if chroma_running; then
        success "Chroma already running on port $CHROMA_PORT"
    else
        info "Starting Chroma on http://$CHROMA_HOST:$CHROMA_PORT (data: $CHROMA_PATH)..."
        "$VENV_CHROMA" run \
            --host  "$CHROMA_HOST" \
            --port  "$CHROMA_PORT" \
            --path  "$CHROMA_PATH" \
            >> "$DATA_DIR/chroma.log" 2>&1 &
        CHROMA_PID=$!

        if wait_for_chroma; then
            success "Chroma started (pid $CHROMA_PID)"
        else
            error "Chroma failed to start – see $DATA_DIR/chroma.log"
            kill "$CHROMA_PID" 2>/dev/null
            [ -n "$REDIS_PID" ] && kill "$REDIS_PID" 2>/dev/null
            exit 1
        fi
    fi

    echo ""
    success "All services ready  (Ctrl+C to stop)"
    info    "  Redis      →  localhost:$REDIS_PORT"
    info    "  Chroma     →  http://$CHROMA_HOST:$CHROMA_PORT"
    echo ""

    wait
}

# ── Stop ──────────────────────────────────────────────────────────────────────

stop_services() {
    # Stop Chroma first (find by port)
    if chroma_running; then
        local cpid; cpid=$(lsof -ti :"$CHROMA_PORT" 2>/dev/null | head -1)
        if [ -n "$cpid" ]; then
            kill "$cpid" && success "Chroma stopped (pid $cpid)"
        fi
    else
        warning "Chroma not running"
    fi

    # Stop Redis (SHUTDOWN SAVE flushes AOF/RDB before exit)
    if redis_running; then
        redis-cli -p "$REDIS_PORT" SHUTDOWN SAVE > /dev/null 2>&1 || true
        success "Redis stopped"
    else
        warning "Redis not running on port $REDIS_PORT"
    fi
}

# ── Status ────────────────────────────────────────────────────────────────────

show_status() {
    echo ""
    if redis_running; then
        success "Redis      localhost:$REDIS_PORT              RUNNING"
    else
        error   "Redis      localhost:$REDIS_PORT              NOT RUNNING"
    fi

    if chroma_running; then
        success "Chroma     http://$CHROMA_HOST:$CHROMA_PORT    RUNNING"
    else
        error   "Chroma     http://$CHROMA_HOST:$CHROMA_PORT    NOT RUNNING"
    fi
    echo ""
}

# ── Entrypoint ────────────────────────────────────────────────────────────────

case "${1:-start}" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        sleep 1
        start_services
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 [start|stop|restart|status]"
        exit 1
        ;;
esac
