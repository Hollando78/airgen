#!/bin/bash
# AirGen Backup Library - Shared Functions
# Common utilities for backup, restore, and verification scripts

set -eo pipefail

# Configuration
BACKUP_ROOT="/root/airgen/backups"
BACKUP_DAILY_DIR="${BACKUP_ROOT}/daily"
BACKUP_WEEKLY_DIR="${BACKUP_ROOT}/weekly"
BACKUP_LOG_DIR="${BACKUP_ROOT}/logs"
PROJECT_ROOT="/root/airgen"
WORKSPACE_DIR="${PROJECT_ROOT}/backend/workspace"

# Date format for filenames
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DATE_ONLY=$(date +%Y%m%d)

# Container names
NEO4J_CONTAINER="airgen_dev_neo4j_1"
POSTGRES_CONTAINER="airgen_dev_postgres_1"
REDIS_CONTAINER="airgen_dev_redis_1"

# Docker volumes
NEO4J_VOLUME="airgen_neo4jdata_dev"
POSTGRES_VOLUME="airgen_pgdata_dev"

# Retention settings
DAILY_RETENTION_DAYS=7
WEEKLY_RETENTION_WEEKS=4

# Logging functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "${BACKUP_LOG_DIR}/backup.log"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "${BACKUP_LOG_DIR}/backup.log" >&2
}

log_success() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS: $*" | tee -a "${BACKUP_LOG_DIR}/backup.log"
}

# Notification functions
send_notification() {
    local title="$1"
    local message="$2"
    local priority="${3:-0}"  # 0=normal, 1=high, 2=emergency

    # Check if pushover is configured
    if [ -f "/opt/pushover/config.py" ]; then
        python3 -c "
import sys
sys.path.append('/opt/pushover')
try:
    from pushover_notify import send_notification
    send_notification('${title}', '${message}', priority=${priority})
except Exception as e:
    print(f'Failed to send notification: {e}', file=sys.stderr)
" 2>/dev/null || log "Notification send failed (non-critical)"
    fi
}

# Health check functions
check_container_running() {
    local container="$1"
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        log_error "Container ${container} is not running"
        return 1
    fi
    return 0
}

check_disk_space() {
    local min_space_gb="${1:-2}"  # Minimum 2GB by default
    local available=$(df /root/airgen/backups | tail -1 | awk '{print $4}')
    local available_gb=$((available / 1024 / 1024))

    if [ $available_gb -lt $min_space_gb ]; then
        log_error "Insufficient disk space: ${available_gb}GB available, ${min_space_gb}GB required"
        return 1
    fi
    log "Disk space check passed: ${available_gb}GB available"
    return 0
}

pre_backup_checks() {
    log "Running pre-backup health checks..."

    # Check disk space
    if ! check_disk_space 2; then
        return 1
    fi

    # Check Neo4j container
    if ! check_container_running "${NEO4J_CONTAINER}"; then
        log_error "Neo4j container not running"
        return 1
    fi

    # Check if Neo4j is responsive
    if ! docker exec ${NEO4J_CONTAINER} wget -qO- http://localhost:7474 >/dev/null 2>&1; then
        log_error "Neo4j is not responsive"
        return 1
    fi

    log_success "All pre-backup checks passed"
    return 0
}

# Backup functions
backup_neo4j() {
    local backup_dir="$1"
    local backup_file="${backup_dir}/neo4j-${TIMESTAMP}.tar.gz"

    log "Backing up Neo4j database..."

    # Neo4j Community Edition backup strategy:
    # Stop container, tar the data directory, restart
    # This is the most reliable method for consistent backups

    log "Stopping Neo4j container for consistent backup..."
    docker stop ${NEO4J_CONTAINER} >/dev/null 2>&1

    # Wait for container to fully stop
    sleep 3

    # Create tar backup of the entire data directory
    log "Creating database archive..."
    if docker run --rm \
        -v ${NEO4J_VOLUME}:/data:ro \
        -v ${backup_dir}:/backup \
        alpine \
        tar czf /backup/$(basename ${backup_file}) -C /data . 2>/dev/null; then

        # Restart the main container
        log "Restarting Neo4j container..."
        docker start ${NEO4J_CONTAINER} >/dev/null 2>&1

        # Wait for Neo4j to be ready
        log "Waiting for Neo4j to start..."
        sleep 10

        # Verify Neo4j is responsive
        local retries=0
        while [ $retries -lt 30 ]; do
            if docker exec ${NEO4J_CONTAINER} wget -qO- http://localhost:7474 >/dev/null 2>&1; then
                break
            fi
            sleep 2
            ((retries++))
        done

        local size=$(du -h "${backup_file}" | cut -f1)
        log_success "Neo4j backup completed: ${backup_file} (${size})"
        echo "${backup_file}"
        return 0
    else
        log_error "Neo4j backup failed"
        # Make sure to restart container even on failure
        docker start ${NEO4J_CONTAINER} >/dev/null 2>&1 || true
        sleep 10
        return 1
    fi
}

backup_postgres() {
    local backup_dir="$1"
    local backup_file="${backup_dir}/postgres-${TIMESTAMP}.sql.gz"

    log "Backing up PostgreSQL database..."

    # Check if Postgres container is running
    if ! check_container_running "${POSTGRES_CONTAINER}"; then
        log "PostgreSQL container not running, skipping"
        return 0
    fi

    # Dump database with compression
    if docker exec ${POSTGRES_CONTAINER} pg_dump -U airgen airgen | gzip > "${backup_file}"; then
        local size=$(du -h "${backup_file}" | cut -f1)
        log_success "PostgreSQL backup completed: ${backup_file} (${size})"
        echo "${backup_file}"
        return 0
    else
        log_error "PostgreSQL backup failed"
        return 1
    fi
}

backup_workspace() {
    local backup_dir="$1"
    local backup_file="${backup_dir}/workspace-${TIMESTAMP}.tar.gz"

    log "Backing up workspace files..."

    if [ ! -d "${WORKSPACE_DIR}" ]; then
        log_error "Workspace directory not found: ${WORKSPACE_DIR}"
        return 1
    fi

    # Create compressed archive
    if tar -czf "${backup_file}" -C "$(dirname ${WORKSPACE_DIR})" "$(basename ${WORKSPACE_DIR})"; then
        local size=$(du -h "${backup_file}" | cut -f1)
        log_success "Workspace backup completed: ${backup_file} (${size})"
        echo "${backup_file}"
        return 0
    else
        log_error "Workspace backup failed"
        return 1
    fi
}

backup_config() {
    local backup_dir="$1"
    local backup_file="${backup_dir}/config-${TIMESTAMP}.tar.gz"

    log "Backing up configuration files..."

    # Create temp directory for config files
    local temp_dir=$(mktemp -d)

    # Copy config files
    cp -r ${PROJECT_ROOT}/env ${temp_dir}/ 2>/dev/null || true
    cp ${PROJECT_ROOT}/docker-compose*.yml ${temp_dir}/ 2>/dev/null || true
    cp ${PROJECT_ROOT}/.gitignore ${temp_dir}/ 2>/dev/null || true

    # Save git state
    cd ${PROJECT_ROOT}
    git rev-parse HEAD > ${temp_dir}/git-commit.txt 2>/dev/null || echo "unknown" > ${temp_dir}/git-commit.txt
    git branch --show-current > ${temp_dir}/git-branch.txt 2>/dev/null || echo "unknown" > ${temp_dir}/git-branch.txt
    git status --porcelain > ${temp_dir}/git-status.txt 2>/dev/null || echo "unknown" > ${temp_dir}/git-status.txt

    # Create archive
    if tar -czf "${backup_file}" -C ${temp_dir} .; then
        local size=$(du -h "${backup_file}" | cut -f1)
        log_success "Config backup completed: ${backup_file} (${size})"
        rm -rf ${temp_dir}
        echo "${backup_file}"
        return 0
    else
        log_error "Config backup failed"
        rm -rf ${temp_dir}
        return 1
    fi
}

# Cleanup functions
cleanup_old_backups() {
    local backup_dir="$1"
    local retention_days="$2"

    log "Cleaning up backups older than ${retention_days} days in ${backup_dir}..."

    local count=0
    while IFS= read -r -d '' file; do
        rm -f "$file"
        ((count++))
    done < <(find "${backup_dir}" -type f -mtime +${retention_days} -print0 2>/dev/null)

    if [ $count -gt 0 ]; then
        log "Removed ${count} old backup file(s)"
    else
        log "No old backups to clean up"
    fi
}

# Verification functions
verify_backup() {
    local backup_file="$1"

    if [ ! -f "${backup_file}" ]; then
        log_error "Backup file not found: ${backup_file}"
        return 1
    fi

    # Check if file is not empty
    local size=$(stat -f%z "${backup_file}" 2>/dev/null || stat -c%s "${backup_file}" 2>/dev/null)
    if [ "$size" -lt 1000 ]; then
        log_error "Backup file too small (${size} bytes): ${backup_file}"
        return 1
    fi

    # Verify it's a valid compressed file
    if [[ "${backup_file}" == *.gz ]]; then
        if ! gzip -t "${backup_file}" 2>/dev/null; then
            log_error "Backup file corrupted: ${backup_file}"
            return 1
        fi
    elif [[ "${backup_file}" == *.tar.gz ]]; then
        if ! tar -tzf "${backup_file}" >/dev/null 2>&1; then
            log_error "Backup archive corrupted: ${backup_file}"
            return 1
        fi
    fi

    log "Backup verified: ${backup_file}"
    return 0
}

# Restore functions (placeholders for backup-restore.sh)
restore_neo4j() {
    local backup_file="$1"
    log "Restore function called for Neo4j: ${backup_file}"
    # Implementation in backup-restore.sh
}

restore_postgres() {
    local backup_file="$1"
    log "Restore function called for PostgreSQL: ${backup_file}"
    # Implementation in backup-restore.sh
}

restore_workspace() {
    local backup_file="$1"
    log "Restore function called for workspace: ${backup_file}"
    # Implementation in backup-restore.sh
}

# Export functions
export -f log log_error log_success
export -f send_notification
export -f check_container_running check_disk_space pre_backup_checks
export -f backup_neo4j backup_postgres backup_workspace backup_config
export -f cleanup_old_backups
export -f verify_backup
