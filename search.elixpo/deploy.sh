#!/bin/bash

# Usage:
#   ./deploy.sh start              # Build + start with 5 containers (default)
#   ./deploy.sh start 3            # Build + start with 3 containers
#   ./deploy.sh scale 5            # Scale to 5 containers
#   ./deploy.sh stop               # Stop all containers
#   ./deploy.sh logs               # View nginx logs
#   ./deploy.sh logs app           # View app logs
#   ./deploy.sh health             # Check all services
#   ./deploy.sh restart            # Restart all services
#   ./deploy.sh clean              # Clean up volumes
#   ./deploy.sh backup             # Backup Redis data

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

COMPOSE_FILE="docker-compose.yml"
COMPOSE_ENV_FILE=".env.local"

compose() {
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

# Only validate container count for commands that use it
case "${1:-help}" in
    start|scale|stary|quick)
        CONTAINER_COUNT=${2:-5}
        if ! [[ "$CONTAINER_COUNT" =~ ^[0-9]+$ ]]; then
            echo -e "${RED}✗${NC} Container count must be a number"
            exit 1
        fi
        ;;
esac

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

check_env() {
    if [ ! -f ".env.local" ]; then
        error ".env.local file not found in root directory"
        info "Use the root .env.local file with:"
        echo "  POLLINATIONS_API_KEY=your_key"
        echo "  MODEL=your_model"
        echo "  IMAGE_MODEL=your_image_model"
        echo "  HF_TOKEN=your_hf_token"
        exit 1
    fi
}

check_docker() {
    if ! command -v docker compose &> /dev/null; then
        error "docker compose is not installed"
        exit 1
    fi
}

start_services() {
    local count=$1
    check_env
    check_docker

    # `up -d` detects image/config changes and only recreates affected containers.
    # Unchanged containers (redis, chroma, nginx) stay untouched — no data loss,
    # no renaming, no extra disk usage.
    info "Starting lixSearch with $count app container(s)..."
    compose up -d --remove-orphans --scale lixsearch-app="$count"

    info "Waiting for services to be healthy (30 seconds)..."
    sleep 30

    success "Services started ($count app containers)"
    show_status
}

build_image() {
    local no_cache=${1:-false}
    check_docker

    info "Building lixSearch image..."
    
    if [ "$no_cache" = "true" ]; then
        info "Building with --no-cache flag (smallest image)..."
        compose build --no-cache
    else
        compose build
    fi

    success "Image built successfully"
}

scale_containers() {
    local count=$1
    if ! [[ "$count" =~ ^[0-9]+$ ]]; then
        error "Scale count must be a number"
        exit 1
    fi
    check_docker

    info "Scaling to $count container(s)..."
    compose up -d --remove-orphans --scale lixsearch-app="$count"

    sleep 10
    success "Scaled to $count container(s)"
    show_status
}

stop_services() {
    check_docker
    info "Stopping all services..."
    compose down --remove-orphans
    success "Services stopped"
}

clean_volumes() {
    check_docker
    warning "This will delete all data (Redis, Chroma, Nginx cache)"
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        info "Removing containers and volumes..."
        compose down -v --remove-orphans
        success "Cleaned up"
    fi
}

show_status() {
    echo ""
    compose ps
    echo ""
}

show_logs() {
    local service=${1:-nginx}
    check_docker

    case "$service" in
        app|lixsearch)
            compose logs -f lixsearch-app
            ;;
        redis)
            compose logs -f redis
            ;;
        chroma)
            compose logs -f chroma-server
            ;;
        *)
            compose logs -f nginx
            ;;
    esac
}

check_compose_health() {
    local service="$1"
    local label="$2"
    local cid
    cid=$(compose ps -q "$service" 2>/dev/null)
    if [ -z "$cid" ]; then
        error "$label: NOT RUNNING"
        return
    fi
    local status
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$cid" 2>/dev/null)
    case "$status" in
        healthy)   success "$label: HEALTHY" ;;
        starting)  warning "$label: STARTING" ;;
        unhealthy) error   "$label: UNHEALTHY" ;;
        no-healthcheck)
            if [ "$(docker inspect --format '{{.State.Running}}' "$cid" 2>/dev/null)" = "true" ]; then
                success "$label: RUNNING (no healthcheck)"
            else
                error "$label: STOPPED"
            fi
            ;;
        *) error "$label: UNKNOWN ($status)" ;;
    esac
}

check_health() {
    check_docker
    echo ""
    info "Service Status:"
    show_status

    echo ""
    info "Health Checks:"

    if curl -s http://localhost/api/health > /dev/null 2>&1; then
        success "Nginx & API: HEALTHY"
    else
        error "Nginx & API: UNREACHABLE"
    fi

    check_compose_health redis "Redis"
    check_compose_health chroma-server "Chroma"

    echo ""
}

restart_services() {
    check_docker
    info "Restarting all services..."
    compose up -d --remove-orphans --force-recreate
    sleep 10
    success "Services restarted"
    check_health
}

backup_redis() {
    check_docker
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="backups"

    mkdir -p "$backup_dir"

    info "Backing up Redis data..."
    compose exec redis redis-cli BGSAVE > /dev/null 2>&1

    sleep 2

    compose cp redis:/data/dump.rdb \
        "$backup_dir/redis_dump_${timestamp}.rdb" 2>/dev/null || true

    success "Redis backed up to $backup_dir/redis_dump_${timestamp}.rdb"

    ls -t "$backup_dir"/redis_dump_* | tail -n +11 | xargs -r rm
}

test_scaling() {
    check_docker

    echo ""
    info "Testing scalability from 1 to 5 containers..."

    for count in 1 2 3 5; do
        info "Scaling to $count container(s)..."
        scale_containers "$count"

        sleep 5
        response=$(curl -s -w "\n%{http_code}" http://localhost/api/health)
        status=$(echo "$response" | tail -n1)

        if [ "$status" = "200" ]; then
            success "✓ $count container(s) - healthy"
        else
            error "✗ $count container(s) - unhealthy (HTTP $status)"
        fi
    done

    info "Scaling test complete"
    echo ""
}

_bump_version() {
    local pyproject=$1
    local bump_type=$2
    local current=$(grep '^version' "$pyproject" | sed 's/version = "\(.*\)"/\1/')
    IFS='.' read -r major minor patch <<< "$current"
    case "$bump_type" in
        major) major=$((major + 1)); minor=0; patch=0 ;;
        minor) minor=$((minor + 1)); patch=0 ;;
        patch) patch=$((patch + 1)) ;;
    esac
    echo "${major}.${minor}.${patch}"
}

_build_and_upload_pypi() {
    local pkg_dir=$1
    local pkg_name=$2
    local new_version=$3

    info "Building ${pkg_name}..."
    cd "$pkg_dir"
    rm -rf dist/ build/ *.egg-info
    python -m build
    cd ..
    success "Built dist files"

    info "Uploading ${pkg_name} to PyPI..."
    twine upload "${pkg_dir}/dist/*"
    success "Published ${pkg_name} ${new_version} to PyPI"
}

_github_release() {
    local tag=$1
    local title=$2
    local notes=$3
    shift 3
    local assets=("$@")

    if ! command -v gh &> /dev/null; then
        warning "gh CLI not installed — skipping GitHub release"
        info "Install: https://cli.github.com"
        return 1
    fi

    info "Creating GitHub release ${tag}..."
    git add -A
    git commit -m "release: ${title}"
    git tag "$tag"
    git push origin main --tags
    gh release create "$tag" "${assets[@]}" \
        --title "$title" \
        --notes "$notes"
    success "GitHub release ${tag} created"
}

# ── Package paths ──────────────────────────────────────

CACHE_PKG="package/lix_open_cache_pkg"
# SEARCH_PKG removed — lix-open-search deprecated and removed from PyPI

_pkg_version() {
    local pkg_dir=$1
    grep '^version' "${pkg_dir}/pyproject.toml" | sed 's/version = "\(.*\)"/\1/'
}

# ── Fine-grained release commands ──────────────────────

release_bump() {
    local target=${1:?Usage: release bump <cache|search|all> [patch|minor|major]}
    local bump_type=${2:-patch}

    _do_bump() {
        local pkg_dir=$1 pkg_name=$2
        local current=$(_pkg_version "$pkg_dir")
        local new=$(_bump_version "${pkg_dir}/pyproject.toml" "$bump_type")
        sed -i "s/^version = \".*\"/version = \"${new}\"/" "${pkg_dir}/pyproject.toml"
        # Sync __init__.__version__ if present
        local init="${pkg_dir}/$(basename "$pkg_dir" _pkg)/__init__.py"
        sed -i "s/^__version__ = \".*\"/__version__ = \"${new}\"/" "$init" 2>/dev/null || true
        success "${pkg_name}: ${current} → ${new}"
    }

    case "$target" in
        cache)  _do_bump "$CACHE_PKG" "lix-open-cache" ;;
        all)    _do_bump "$CACHE_PKG" "lix-open-cache" ;;
        *)      error "Unknown target: $target (use cache, search, or all)"; exit 1 ;;
    esac
}

release_build() {
    local target=${1:?Usage: release build <cache|search|all>}

    _do_build() {
        local pkg_dir=$1 pkg_name=$2
        local v=$(_pkg_version "$pkg_dir")
        info "Building ${pkg_name} v${v}..."
        cd "$pkg_dir"
        rm -rf dist/ build/ *.egg-info
        python -m build
        cd - > /dev/null
        success "Built ${pkg_dir}/dist/"
    }

    case "$target" in
        cache)  _do_build "$CACHE_PKG" "lix-open-cache" ;;
        all)    _do_build "$CACHE_PKG" "lix-open-cache" ;;
        *)      error "Unknown target: $target"; exit 1 ;;
    esac
}

release_pypi() {
    local target=${1:?Usage: release pypi <cache|search|all>}

    _do_pypi() {
        local pkg_dir=$1 pkg_name=$2
        local target_name=$(echo "$pkg_name" | sed 's/lix-open-//')
        # Always rebuild to ensure dist matches current version
        release_build "$target_name"
        local v=$(_pkg_version "$pkg_dir")
        info "Uploading ${pkg_name} v${v} to PyPI..."
        twine upload "${pkg_dir}/dist/"*
        success "Published: pip install ${pkg_name}==${v}"
    }

    case "$target" in
        cache)  _do_pypi "$CACHE_PKG" "lix-open-cache" ;;
        all)    _do_pypi "$CACHE_PKG" "lix-open-cache" ;;
        *)      error "Unknown target: $target"; exit 1 ;;
    esac
}

release_docker() {
    # Load credentials from .env.local
    if [ -f ".env.local" ]; then
        set -a
        source .env.local
        set +a
    fi

    if [ -z "$GITHUB_TOKEN" ]; then
        error "GITHUB_TOKEN not set in .env.local"
        exit 1
    fi
    if [ -z "$DOCKER_HUB_API" ]; then
        warning "DOCKER_HUB_API not set in .env.local — skipping Docker Hub push"
    fi

    local ghcr_image="ghcr.io/${GITHUB_USER:-Circuit-Overtime}/lixsearch"
    local hub_image="${DOCKERHUB_USER:-elixpo}/lixsearch"
    local version=$(_pkg_version "$CACHE_PKG")
    info "Building Docker image v${version}"

    check_docker

    docker build -f Dockerfile \
        -t "${ghcr_image}:${version}" \
        -t "${ghcr_image}:latest" \
        -t "${hub_image}:${version}" \
        -t "${hub_image}:latest" \
        .
    success "Built image v${version}"

    info "Pushing to ghcr.io..."
    echo "${GITHUB_TOKEN}" | docker login ghcr.io -u "${GITHUB_USER:-Circuit-Overtime}" --password-stdin
    docker push "${ghcr_image}:${version}"
    docker push "${ghcr_image}:latest"
    success "Pushed ${ghcr_image}:${version}"

    if [ -n "$DOCKER_HUB_API" ]; then
        info "Pushing to Docker Hub..."
        echo "${DOCKER_HUB_API}" | docker login -u "${DOCKERHUB_USER:-elixpo}" --password-stdin
        docker push "${hub_image}:${version}"
        docker push "${hub_image}:latest"
        success "Pushed ${hub_image}:${version}"
    fi

    echo ""
    success "Docker image v${version} published"
    info "GHCR: docker pull ${ghcr_image}:${version}"
    info "Hub:  docker pull ${hub_image}:${version}"
    echo ""
    info "NOTE: If the image doesn't appear in GitHub Packages, ensure your"
    info "      GITHUB_TOKEN has the 'write:packages' scope enabled."
    info "      GitHub → Settings → Developer settings → Personal access tokens → Edit"
}

release_github() {
    local target=${1:?Usage: release github <cache|search|all>}

    if ! command -v gh &> /dev/null; then
        error "gh CLI not installed (https://cli.github.com)"
        exit 1
    fi

    local repo_url
    repo_url=$(git remote get-url origin | sed 's|.*github.com/||;s|\.git||')

    git add -A
    git commit -m "release: update packages" 2>/dev/null || true
    git push origin main 2>/dev/null || true

    _cache_notes() {
        local v=$1
        cat <<NOTES
## lix-open-cache v${v}

Standalone multi-layer Redis caching + Huffman disk archival for conversational AI.

### Install

\`\`\`bash
pip install lix-open-cache==${v}
\`\`\`

### Quick Start

\`\`\`python
from lix_open_cache import CacheConfig, CacheCoordinator

config = CacheConfig(redis_host="localhost", redis_port=6379)
cache = CacheCoordinator(session_id="user-abc", config=config)

# Store & retrieve conversation context
cache.add_message_to_context("user", "What's the weather in Tokyo?")
cache.add_message_to_context("assistant", "22°C and sunny.")
history = cache.get_context_messages()

# Semantic cache — skip LLM on similar queries
import numpy as np
embedding = np.random.rand(384).astype(np.float32)
cached = cache.get_semantic_response("https://weather.com", embedding)
\`\`\`

### Three Cache Layers

| Layer | Purpose | Backend | TTL |
|-------|---------|---------|-----|
| **Session Context Window** | Rolling 20-message window + disk overflow | Redis DB 2 + \`.huff\` files | 24h |
| **Semantic Query Cache** | Deduplicate similar queries (cosine ≥ 0.90) | Redis DB 0 | 5 min |
| **URL Embedding Cache** | Cache embedding vectors per URL | Redis DB 1 | 24h |

### Key Features

- **Two-tier hybrid storage** — Redis hot window + Huffman-compressed disk cold archive
- **LRU eviction daemon** — auto-migrates idle sessions to disk, re-hydrates on return
- **smart_context()** — recent messages + semantically relevant history from disk
- **Pure Python Huffman codec** — ~54% compression, zero native dependencies
- **CacheConfig dataclass** — all tunables in one place, 12-factor env var support
- **Connection pooling** — shared Redis pools keyed by (host, port, db)

### Dependencies

Only 3: \`redis\`, \`numpy\`, \`loguru\`

### Links

- [PyPI](https://pypi.org/project/lix-open-cache/${v}/)
- [Docs](https://github.com/${repo_url}/tree/main/${CACHE_PKG})
- [Research Paper](https://github.com/${repo_url}/blob/main/docs/paper/lix_cache_paper.pdf)
- [Live Demo](https://search.elixpo.com)
NOTES
    }

    # lix-open-search release notes removed — package deprecated

    _do_gh_release() {
        local pkg_dir=$1 pkg_name=$2 tag=$3
        local v=$(_pkg_version "$pkg_dir")

        local notes
        notes=$(_cache_notes "$v")

        # Collect dist assets
        local assets=()
        [ -d "${pkg_dir}/dist" ] && assets=(${pkg_dir}/dist/*)

        # Delete existing release + tag, then recreate
        gh release delete "$tag" --yes --cleanup-tag 2>/dev/null || true
        git tag -d "$tag" 2>/dev/null || true
        git push origin ":refs/tags/$tag" 2>/dev/null || true

        git tag "$tag"
        git push origin "$tag"

        if [ ${#assets[@]} -gt 0 ]; then
            gh release create "$tag" "${assets[@]}" \
                --title "${pkg_name} v${v}" \
                --notes "$notes" \
                --latest=false
        else
            gh release create "$tag" \
                --title "${pkg_name} v${v}" \
                --notes "$notes" \
                --latest=false
        fi
        success "${pkg_name} v${v} → GitHub release '${tag}' (overwritten)"
    }

    case "$target" in
        cache)  _do_gh_release "$CACHE_PKG" "lix-open-cache" "lix-open-cache" ;;
        all)
            _do_gh_release "$CACHE_PKG" "lix-open-cache" "lix-open-cache"
            ;;
        *)      error "Unknown target: $target (use cache, search, or all)"; exit 1 ;;
    esac
}

# ── Frontend ───────────────────────────────────────────

_sync_paper() {
    local src=""
    for f in docs/paper/paper.pdf docs/paper/arXiv_research_paper.pdf docs/paper/lix_cache_paper.pdf; do
        [ -f "$f" ] && src="$f" && break
    done
    if [ -n "$src" ]; then
        cp "$src" search.elixpo/public/paper.pdf
        success "Synced research paper → search.elixpo/public/paper.pdf"
    else
        warning "No paper PDF found in docs/paper/ — skipping paper sync"
    fi
}

frontend_build() {
    _sync_paper
    info "Building search.elixpo frontend..."
    cd search.elixpo

    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" 2>/dev/null && nvm use 22 2>/dev/null || true

    if ! command -v node &> /dev/null; then
        error "Node.js not found. Run: ./deploy.sh frontend install-node"
        cd ..; exit 1
    fi

    if [ ! -d "node_modules" ]; then
        info "Installing dependencies..."
        npm install --prefer-offline --no-audit
    fi

    npx next build || { cd ..; error "Frontend build failed"; exit 1; }
    cd ..
    [ -s search.elixpo/out/index.html ] || { error "Frontend export is missing search.elixpo/out/index.html"; exit 1; }
    success "Frontend built — search.elixpo/out/"

}

frontend_install_node() {
    info "Installing Node.js 22 LTS via nvm..."
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    fi
    source "$NVM_DIR/nvm.sh"
    nvm install 22
    nvm use 22
    success "Node $(node --version) ready"
}

frontend_deploy() {
    check_env
    check_docker
    [ -s search.elixpo/out/index.html ] || {
        error "Frontend export missing. Run: ./deploy.sh --pages build deploy"
        exit 1
    }
    info "Deploying frontend through the production Nginx container..."
    compose up -d --no-deps --force-recreate --wait --wait-timeout 120 nginx
    success "Frontend deployed through Nginx"
}

# ── Version display ────────────────────────────────────

release_version() {
    local target=${1:-all}
    case "$target" in
        cache)  info "lix-open-cache: $(_pkg_version "$CACHE_PKG")" ;;
        all)
            info "lix-open-cache:  $(_pkg_version "$CACHE_PKG")"
            ;;
    esac
}

# ── Release all ────────────────────────────────────────

release_all() {
    local bump_type=${1:-patch}
    info "Full release (${bump_type} bump)..."
    echo ""

    release_bump all "$bump_type"
    echo ""
    release_build all
    echo ""
    release_pypi all
    echo ""
    release_docker
    echo ""
    release_github all

    echo ""
    success "All released!"
    release_version all
}

# ── Targeted deployment interface ─────────────────────

DRY_RUN=false

run_cmd() {
    if [ "$DRY_RUN" = "true" ]; then
        printf '%s' "[dry-run]"
        printf ' %q' "$@"
        printf '\n'
    else
        "$@"
    fi
}

compose_cmd() {
    if [ "$DRY_RUN" = "true" ]; then
        printf '%s' "[dry-run] docker compose --env-file $COMPOSE_ENV_FILE -f $COMPOSE_FILE"
        printf ' %q' "$@"
        printf '\n'
    else
        compose "$@"
    fi
}

_python_bin() {
    if [ -x "venv/bin/python" ]; then
        echo "venv/bin/python"
    elif command -v python3.11 >/dev/null 2>&1; then
        echo "python3.11"
    else
        echo "python3"
    fi
}

parse_target_actions() {
    WANT_BUILD=false
    WANT_DEPLOY=false
    NO_CACHE=false
    PULL=false
    QUICK=false
    GRAPH=false
    REPLICAS="${APP_REPLICAS:-2}"
    SELECTED_SERVICES=()

    while [ "$#" -gt 0 ]; do
        case "$1" in
            build)      WANT_BUILD=true ;;
            deploy)     WANT_DEPLOY=true ;;
            --quick)    QUICK=true ;;
            --graph)    GRAPH=true ;;
            --no-cache) NO_CACHE=true ;;
            --pull)     PULL=true ;;
            --redis)    SELECTED_SERVICES+=(redis) ;;
            --qdrant)   SELECTED_SERVICES+=(qdrant) ;;
            --ipc)      SELECTED_SERVICES+=(ipc-service) ;;
            --app)      SELECTED_SERVICES+=(lixsearch-app) ;;
            --monitor)  SELECTED_SERVICES+=(monitor) ;;
            --nginx)    SELECTED_SERVICES+=(nginx) ;;
            --all)      SELECTED_SERVICES=() ;;
            --dry-run)  DRY_RUN=true ;;
            --replicas)
                shift
                [ "$#" -gt 0 ] || { error "--replicas requires a number"; exit 1; }
                REPLICAS="$1"
                ;;
            *) error "Unknown target option: $1"; exit 1 ;;
        esac
        shift
    done

    if [ "$WANT_BUILD" != "true" ] && [ "$WANT_DEPLOY" != "true" ]; then
        error "Choose at least one action: build and/or deploy"
        exit 1
    fi
    [[ "$REPLICAS" =~ ^[1-9][0-9]*$ ]] || {
        error "--replicas must be a positive integer"
        exit 1
    }
}

pages_target() {
    parse_target_actions "$@"
    [ "$GRAPH" != "true" ] || {
        error "--graph applies only to --model"
        exit 1
    }
    [ ${#SELECTED_SERVICES[@]} -eq 0 ] || {
        error "Service selectors apply only to --model"
        exit 1
    }
    if [ "$WANT_BUILD" = "true" ]; then
        if [ "$DRY_RUN" = "true" ]; then
            echo "[dry-run] build search.elixpo static export"
        else
            frontend_build
        fi
    fi
    if [ "$WANT_DEPLOY" = "true" ]; then
        if [ "$DRY_RUN" = "true" ]; then
            compose_cmd up -d --no-deps --force-recreate --wait --wait-timeout 120 nginx
        else
            frontend_deploy
        fi
    fi
}

model_target() {
    parse_target_actions "$@"
    check_env
    check_docker

    if [ "$QUICK" = "true" ]; then
        [ ${#SELECTED_SERVICES[@]} -eq 0 ] || {
            error "--quick cannot be combined with service selectors"
            exit 1
        }
        [ "$WANT_BUILD" != "true" ] || run_cmd "$(_python_bin)" -m compileall -q lixsearch
        if [ "$WANT_DEPLOY" = "true" ]; then
            if [ "$DRY_RUN" = "true" ]; then
                echo "[dry-run] hot-copy lixsearch/, skills/, public/, and openapi.yaml; restart app workers"
            else
                "$0" hotfix
            fi
        fi
        return
    fi

    local buildable=()
    local pullable=()
    if [ ${#SELECTED_SERVICES[@]} -eq 0 ]; then
        buildable=(lixsearch-app ipc-service monitor)
        pullable=(redis qdrant nginx)
    else
        local service
        for service in "${SELECTED_SERVICES[@]}"; do
            case "$service" in
                lixsearch-app|ipc-service|monitor) buildable+=("$service") ;;
                redis|qdrant|nginx) pullable+=("$service") ;;
            esac
        done
    fi
    if [ "$GRAPH" = "true" ]; then
        buildable+=(graph-memory-worker)
        pullable+=(falkordb)
    fi

    if [ "$WANT_BUILD" = "true" ]; then
        if [ ${#pullable[@]} -gt 0 ] && [ "$PULL" = "true" ]; then
            if [ "$GRAPH" = "true" ]; then
                compose_cmd --profile graph-memory pull "${pullable[@]}"
            else
                compose_cmd pull "${pullable[@]}"
            fi
        fi
        if [ ${#buildable[@]} -gt 0 ]; then
            local build_args=()
            [ "$GRAPH" != "true" ] || build_args+=(--profile graph-memory)
            build_args+=(build)
            [ "$PULL" != "true" ] || build_args+=(--pull)
            [ "$NO_CACHE" != "true" ] || build_args+=(--no-cache)
            build_args+=("${buildable[@]}")
            compose_cmd "${build_args[@]}"
        elif [ "$PULL" != "true" ]; then
            info "Selected services use upstream images; add --pull to refresh them"
        fi
    fi

    if [ "$WANT_DEPLOY" = "true" ]; then
        if [ ${#SELECTED_SERVICES[@]} -eq 0 ]; then
            local all_up_args=()
            [ "$GRAPH" != "true" ] || all_up_args+=(--profile graph-memory)
            all_up_args+=(up -d --remove-orphans --wait --wait-timeout 240 --scale "lixsearch-app=$REPLICAS")
            compose_cmd "${all_up_args[@]}"
        else
            local up_args=()
            [ "$GRAPH" != "true" ] || up_args+=(--profile graph-memory)
            up_args+=(up -d --no-deps --wait --wait-timeout 180)
            if [[ " ${SELECTED_SERVICES[*]} " == *" lixsearch-app "* ]]; then
                up_args+=(--scale "lixsearch-app=$REPLICAS")
            fi
            up_args+=("${SELECTED_SERVICES[@]}")
            [ "$GRAPH" != "true" ] || up_args+=(falkordb graph-memory-worker)
            compose_cmd "${up_args[@]}"
        fi
        [ "$DRY_RUN" = "true" ] || show_status
    fi
}

mcp_target() {
    parse_target_actions "$@"
    [ "$GRAPH" != "true" ] || {
        error "--graph applies only to --model"
        exit 1
    }
    [ ${#SELECTED_SERVICES[@]} -eq 0 ] || {
        error "Service selectors apply only to --model"
        exit 1
    }
    check_env
    check_docker
    local py
    py="$(_python_bin)"

    if [ "$WANT_BUILD" = "true" ]; then
        run_cmd "$py" -m compileall -q lixsearch/mcpServer
        if [ "$DRY_RUN" = "true" ]; then
            echo "[dry-run] PYTHONPATH=lixsearch $py -m pytest -q tester/test_mcp_server.py tester/test_structured_evidence.py"
        else
            PYTHONPATH=lixsearch "$py" -m pytest -q \
                tester/test_mcp_server.py tester/test_structured_evidence.py
        fi
        local build_args=(build)
        [ "$PULL" != "true" ] || build_args+=(--pull)
        [ "$NO_CACHE" != "true" ] || build_args+=(--no-cache)
        build_args+=(lixsearch-app)
        compose_cmd "${build_args[@]}"
    fi

    if [ "$WANT_DEPLOY" = "true" ]; then
        compose_cmd up -d --no-deps --wait --wait-timeout 180 --scale "lixsearch-app=$REPLICAS" lixsearch-app
        [ "$DRY_RUN" = "true" ] || show_status
    fi
}

show_help() {
    cat << EOF
${BLUE}lixSearch Production Deployment Helper${NC}

${YELLOW}Targeted usage:${NC}
  ./deploy.sh --pages build deploy
  ./deploy.sh --model build deploy [OPTIONS]
  ./deploy.sh --mcp build deploy [OPTIONS]

${YELLOW}Target options:${NC}
  --quick             Validate and hot-copy model code without rebuilding images
  --graph             Include the optional FalkorDB + Graphiti worker profile
  --app | --ipc       Select app workers or the shared IPC service
  --redis | --qdrant  Select a state service (add --pull to refresh its image)
  --monitor | --nginx Select monitoring or edge proxy
  --all               Select the complete model stack (default)
  --replicas N        App replica count (default: APP_REPLICAS or 2)
  --pull              Pull base/upstream images while building
  --no-cache          Disable Docker build cache
  --dry-run           Print commands without changing services

${YELLOW}Legacy usage:${NC}
  ./deploy.sh COMMAND [ARGS]

${YELLOW}Commands:${NC}
  build [no-cache]  Build image (add 'no-cache' for --no-cache flag)
  stary [N]         Build with cache + start (default 5 containers)
  quick [N]         Rebuild app only + rolling restart (infra/dep changes)
  hotfix            Copy code into running containers + restart (fastest, code-only)
  start [N]         Build + start services (N containers, default 5, recreates existing)
  scale N           Scale to N containers
  stop              Stop all services
  restart           Restart all services
  health            Check service health
  logs [SERVICE]    Show logs (nginx|app|redis|chroma)
  backup            Backup Redis data
  clean             Remove all data (volumes)
  test-scale        Test scalability (1→2→3→5 containers)
  release <sub>       Package release (run ./deploy.sh release for full help)
  frontend <sub>      Frontend (build | deploy | install-node)
  help              Show this help message

${YELLOW}Examples:${NC}
  ./deploy.sh build                       # Build with cache
  ./deploy.sh build no-cache              # Build smallest image (no-cache)
  ./deploy.sh start                       # Build + start with 5 containers
  ./deploy.sh start 3                     # Build + start with 3 containers
  ./deploy.sh scale 5                     # Scale to 5 containers
  ./deploy.sh logs app                    # View app logs
  ./deploy.sh health                      # Check all services
  ./deploy.sh backup                      # Backup Redis
  ./deploy.sh release version              # Show all package versions
  ./deploy.sh release bump cache          # Bump lix-open-cache (patch)
  ./deploy.sh release build cache         # Build lix-open-cache
  ./deploy.sh release pypi cache          # Upload lix-open-cache to PyPI
  ./deploy.sh release docker              # Push Docker to ghcr.io + Hub
  ./deploy.sh release all minor           # Full release (minor bump)
  ./deploy.sh frontend build              # Build Next.js static site
  ./deploy.sh frontend deploy             # Build + deploy to Cloudflare Pages

${YELLOW}Environment:${NC}
  Use the root .env.local file with required variables:
    POLLINATIONS_API_KEY=your_key
    MODEL=your_model
    IMAGE_MODEL=your_image_model
    HF_TOKEN=your_hf_token

${YELLOW}Quick Start:${NC}
  1. Ensure .env.local exists in root directory
  2. ./deploy.sh start              # builds + starts 5 containers
  3. ./deploy.sh health

EOF
}

case "${1:-help}" in
    --pages)
        shift
        pages_target "$@"
        exit 0
        ;;
    --model)
        shift
        model_target "$@"
        exit 0
        ;;
    --mcp)
        shift
        mcp_target "$@"
        exit 0
        ;;
esac

case "${1:-help}" in

    build)
        build_image "$2"
        ;;
    start)
        start_services "$CONTAINER_COUNT"
        ;;
    stary)
        info "Build + start with ${CONTAINER_COUNT} containers..."
        build_image "false"
        start_services "$CONTAINER_COUNT"
        ;;
    quick)
        info "Quick restart — rebuild app image only, rolling restart..."
        check_env
        check_docker
        compose build lixsearch-app
        compose up -d --remove-orphans --no-deps --scale lixsearch-app="${CONTAINER_COUNT}" lixsearch-app
        info "Waiting for health..."
        sleep 30
        success "App containers restarted (${CONTAINER_COUNT} replicas)"
        show_status
        ;;
    hotfix)
        info "Hotfix — copying code into running containers (no rebuild)..."
        check_docker
        containers=$(compose ps -q lixsearch-app 2>/dev/null)
        if [ -z "$containers" ]; then
            error "No running app containers found"
            exit 1
        fi
        count=0
        for cid in $containers; do
            cname=$(docker inspect --format '{{.Name}}' "$cid" | sed 's|^/||')
            docker cp lixsearch/. "$cid":/app/lixsearch/
            docker cp skills/. "$cid":/app/skills/
            docker cp openapi.yaml "$cid":/app/openapi.yaml
            docker cp public/. "$cid":/app/public/
            info "  Updated $cname"
            count=$((count + 1))
        done
        # Also update ipc-service if running
        ipc_cid=$(compose ps -q ipc-service 2>/dev/null)
        ipc_updated=false
        if [ -n "$ipc_cid" ]; then
            docker cp lixsearch/. "$ipc_cid":/app/lixsearch/
            docker cp skills/. "$ipc_cid":/app/skills/
            info "  Updated ipc-service"
            ipc_updated=true
        fi
        if [ "$ipc_updated" = "true" ]; then
            info "Restarting IPC service to load updated search workers..."
            compose restart ipc-service
        fi
        info "Restarting $count app container(s)..."
        compose restart lixsearch-app
        sleep 15
        success "Hotfix applied to $count container(s)"
        show_status
        ;;
    scale)
        if [ -z "$2" ]; then
            error "scale requires a number (e.g., ./deploy.sh scale 3)"
            exit 1
        fi
        scale_containers "$2"
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    health)
        check_health
        ;;
    logs)
        show_logs "$2"
        ;;
    backup)
        backup_redis
        ;;
    clean)
        clean_volumes
        ;;
    test-scale)
        test_scaling
        ;;
    frontend)
        case "${2:-build}" in
            build)        frontend_build ;;
            deploy)       frontend_deploy ;;
            install-node) frontend_install_node ;;
            *)            error "Usage: ./deploy.sh frontend <build|deploy|install-node>"; exit 1 ;;
        esac
        ;;
    release)
        case "${2:-help}" in
            version) release_version "$3" ;;
            bump)    release_bump "$3" "$4" ;;
            build)   release_build "$3" ;;
            pypi)    release_pypi "$3" ;;
            docker)  release_docker ;;
            github)  release_github "$3" ;;
            all)     release_all "$3" ;;
            *)
                cat <<RELEASE_HELP
${YELLOW}Usage:${NC} ./deploy.sh release <command> [target] [bump_type]

${YELLOW}Targets:${NC} cache | search | all

${YELLOW}Commands:${NC}
  version [target]            Show package version(s)
  bump <target> [TYPE]        Bump version (patch|minor|major)
  build <target>              Build .whl + .tar.gz locally
  pypi <target>               Upload to PyPI (auto-builds if needed)
  docker                      Build + push Docker image to ghcr.io + Docker Hub
  github <target>             Create/update GitHub release (cache|search|all)
  all [TYPE]                  Full release: bump + build + PyPI + Docker + GitHub

${YELLOW}Examples:${NC}
  ./deploy.sh release version              # Show all versions
  ./deploy.sh release version cache        # Show cache version
  ./deploy.sh release bump cache           # Bump cache patch
  ./deploy.sh release bump all minor       # Bump both minor
  ./deploy.sh release build search         # Build search .whl
  ./deploy.sh release pypi cache           # Upload cache to PyPI
  ./deploy.sh release pypi all             # Upload both to PyPI
  ./deploy.sh release docker               # Push Docker image
  ./deploy.sh release github cache          # Create/update cache release
  ./deploy.sh release github all           # Create/update both releases
  ./deploy.sh release all                  # Everything (patch)
  ./deploy.sh release all minor            # Everything (minor)
RELEASE_HELP
                ;;
        esac
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
