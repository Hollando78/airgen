#!/bin/bash
# AirGen Backup Restore Script
# Restores Neo4j, PostgreSQL, workspace, and configuration from backups
# Usage: ./backup-restore.sh [backup-directory] [--dry-run] [--component=neo4j|postgres|workspace|config|all]

set -eo pipefail

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/backup-lib.sh"

# Parse arguments
BACKUP_DIR=""
DRY_RUN=false
COMPONENT="all"

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --component=*)
            COMPONENT="${1#*=}"
            shift
            ;;
        *)
            BACKUP_DIR="$1"
            shift
            ;;
    esac
done

# Validate backup directory
if [ -z "${BACKUP_DIR}" ]; then
    log_error "Usage: $0 <backup-directory> [--dry-run] [--component=neo4j|postgres|workspace|config|all]"
    echo ""
    echo "Available backups:"
    find "${BACKUP_DAILY_DIR}" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort -r | head -7
    exit 1
fi

if [ ! -d "${BACKUP_DIR}" ]; then
    log_error "Backup directory not found: ${BACKUP_DIR}"
    exit 1
fi

# Main restore function
main() {
    log "========================================"
    log "Starting backup restore"
    log "Backup directory: ${BACKUP_DIR}"
    log "Component: ${COMPONENT}"
    log "Dry run: ${DRY_RUN}"
    log "========================================"

    # Safety check
    if [ "$DRY_RUN" = false ]; then
        log "⚠ WARNING: This will overwrite existing data!"
        log "   Press Ctrl+C within 10 seconds to cancel..."
        sleep 10
    fi

    # Pre-restore checks
    if ! pre_restore_checks; then
        log_error "Pre-restore checks failed"
        exit 1
    fi

    local restore_success=true

    # Restore components based on selection
    case "${COMPONENT}" in
        neo4j)
            restore_neo4j_component || restore_success=false
            ;;
        postgres)
            restore_postgres_component || restore_success=false
            ;;
        workspace)
            restore_workspace_component || restore_success=false
            ;;
        config)
            restore_config_component || restore_success=false
            ;;
        all)
            restore_neo4j_component || restore_success=false
            restore_postgres_component || restore_success=false
            restore_workspace_component || restore_success=false
            restore_config_component || restore_success=false
            ;;
        *)
            log_error "Invalid component: ${COMPONENT}"
            exit 1
            ;;
    esac

    # Final status
    if [ "$restore_success" = true ]; then
        log "========================================"
        log_success "Restore completed successfully"
        log "========================================"

        if [ "$DRY_RUN" = false ]; then
            send_notification "AirGen Restore Complete" "Data restored from backup" 0
        fi
        exit 0
    else
        log "========================================"
        log_error "Restore completed with errors"
        log "========================================"
        exit 1
    fi
}

# Pre-restore checks
pre_restore_checks() {
    log "Running pre-restore checks..."

    # Verify backup directory has valid backups
    local backup_count=$(find "${BACKUP_DIR}" -type f \( -name "*.gz" -o -name "*.dump" \) 2>/dev/null | wc -l)
    if [ $backup_count -eq 0 ]; then
        log_error "No backup files found in ${BACKUP_DIR}"
        return 1
    fi

    log "Found ${backup_count} backup file(s)"

    # Check if manifest exists
    if [ -f "${BACKUP_DIR}/MANIFEST.txt" ]; then
        log "Manifest found, verifying checksums..."
        if ! verify_manifest_checksums; then
            log_error "Manifest verification failed"
            return 1
        fi
    else
        log "Warning: No manifest found, skipping checksum verification"
    fi

    log_success "Pre-restore checks passed"
    return 0
}

# Verify manifest checksums before restore
verify_manifest_checksums() {
    local manifest="${BACKUP_DIR}/MANIFEST.txt"
    local all_ok=true

    while read -r line; do
        if [[ $line =~ ^File:\ (.+)$ ]]; then
            local filename="${BASH_REMATCH[1]}"
            local file="${BACKUP_DIR}/${filename}"

            read -r checksum_line
            if [[ $checksum_line =~ SHA256:\ ([a-f0-9]+)$ ]]; then
                local expected="${BASH_REMATCH[1]}"

                if [ -f "${file}" ]; then
                    local actual=$(sha256sum "${file}" | cut -d' ' -f1)
                    if [ "${expected}" != "${actual}" ]; then
                        log_error "Checksum mismatch: ${filename}"
                        all_ok=false
                    fi
                fi
            fi
        fi
    done < "${manifest}"

    [ "$all_ok" = true ]
}

# Restore Neo4j
restore_neo4j_component() {
    log "Restoring Neo4j database..."

    # Find most recent Neo4j backup (tar.gz format)
    local neo4j_backup=$(find "${BACKUP_DIR}" -name "neo4j-*.tar.gz" -type f | sort -r | head -1)

    if [ -z "${neo4j_backup}" ]; then
        log_error "No Neo4j backup found"
        return 1
    fi

    log "Using backup: $(basename ${neo4j_backup})"

    if [ "$DRY_RUN" = true ]; then
        log "[DRY RUN] Would restore Neo4j from: ${neo4j_backup}"
        log "[DRY RUN] Would stop container, clear data, extract archive, restart"
        return 0
    fi

    # Stop Neo4j container
    log "Stopping Neo4j container..."
    docker stop "${NEO4J_CONTAINER}" 2>/dev/null || true
    sleep 3

    # Clear existing data and restore from backup
    log "Restoring database from archive..."
    if docker run --rm \
        -v ${NEO4J_VOLUME}:/data \
        -v $(dirname ${neo4j_backup}):/backup:ro \
        alpine \
        sh -c "rm -rf /data/* && tar xzf /backup/$(basename ${neo4j_backup}) -C /data" 2>/dev/null; then

        log_success "Neo4j data restored"

        # Restart container
        log "Starting Neo4j container..."
        docker start "${NEO4J_CONTAINER}"

        # Wait for Neo4j to be ready
        log "Waiting for Neo4j to start..."
        sleep 10

        local retries=0
        while [ $retries -lt 30 ]; do
            if docker exec ${NEO4J_CONTAINER} wget -qO- http://localhost:7474 >/dev/null 2>&1; then
                log_success "Neo4j is ready"

                # Run post-restore cleanup to fix any duplicate nodes
                log "Running post-restore cleanup..."
                if command -v npx &> /dev/null; then
                    cd "${PROJECT_ROOT}/backend" && npx tsx ../scripts/post-restore-cleanup.ts
                    if [ $? -eq 0 ]; then
                        log_success "Post-restore cleanup completed"
                    else
                        log "Warning: Post-restore cleanup encountered issues (check logs)"
                    fi

                    # Run data verification to check for missing node types
                    log "Running post-restore data verification..."
                    cd "${PROJECT_ROOT}" && npx tsx scripts/verify-restore-data.ts
                    if [ $? -eq 0 ]; then
                        log_success "Data verification passed"
                    else
                        log "Warning: Data verification found issues (check logs)"
                        log "Some node types or relationships may be missing"
                    fi
                else
                    log "Warning: npx not found, skipping post-restore cleanup and verification"
                    log "Run manually: cd backend && npx tsx ../scripts/post-restore-cleanup.ts"
                    log "              npx tsx scripts/verify-restore-data.ts"
                fi

                return 0
            fi
            sleep 2
            ((retries++))
        done

        log "Warning: Neo4j started but may not be fully ready yet"
        return 0
    else
        log_error "Failed to restore Neo4j database"
        docker start "${NEO4J_CONTAINER}" 2>/dev/null || true
        return 1
    fi
}

# Restore PostgreSQL
restore_postgres_component() {
    log "Restoring PostgreSQL database..."

    # Find most recent PostgreSQL backup
    local postgres_backup=$(find "${BACKUP_DIR}" -name "postgres-*.sql.gz" -type f | sort -r | head -1)

    if [ -z "${postgres_backup}" ]; then
        log "No PostgreSQL backup found (may not be in use)"
        return 0
    fi

    log "Using backup: $(basename ${postgres_backup})"

    if [ "$DRY_RUN" = true ]; then
        log "[DRY RUN] Would restore PostgreSQL from: ${postgres_backup}"
        return 0
    fi

    # Check if container is running
    if ! check_container_running "${POSTGRES_CONTAINER}"; then
        log "PostgreSQL container not running, skipping"
        return 0
    fi

    # Drop and recreate database
    log "Dropping existing database..."
    docker exec ${POSTGRES_CONTAINER} psql -U airgen -c "DROP DATABASE IF EXISTS airgen;" 2>/dev/null || true
    docker exec ${POSTGRES_CONTAINER} psql -U airgen -c "CREATE DATABASE airgen;"

    # Restore database
    log "Restoring database dump..."
    if gunzip -c "${postgres_backup}" | docker exec -i ${POSTGRES_CONTAINER} psql -U airgen airgen; then
        log_success "PostgreSQL database restored"
        return 0
    else
        log_error "Failed to restore PostgreSQL database"
        return 1
    fi
}

# Restore workspace
restore_workspace_component() {
    log "Restoring workspace files..."

    # Find most recent workspace backup
    local workspace_backup=$(find "${BACKUP_DIR}" -name "workspace-*.tar.gz" -type f | sort -r | head -1)

    if [ -z "${workspace_backup}" ]; then
        log_error "No workspace backup found"
        return 1
    fi

    log "Using backup: $(basename ${workspace_backup})"

    if [ "$DRY_RUN" = true ]; then
        log "[DRY RUN] Would restore workspace from: ${workspace_backup}"
        return 0
    fi

    # Create backup of existing workspace
    if [ -d "${WORKSPACE_DIR}" ]; then
        local backup_existing="${WORKSPACE_DIR}.pre-restore-$(date +%Y%m%d-%H%M%S)"
        log "Backing up existing workspace to: ${backup_existing}"
        mv "${WORKSPACE_DIR}" "${backup_existing}"
    fi

    # Extract workspace
    log "Extracting workspace archive..."
    mkdir -p "$(dirname ${WORKSPACE_DIR})"

    if tar -xzf "${workspace_backup}" -C "$(dirname ${WORKSPACE_DIR})"; then
        log_success "Workspace files restored"
        return 0
    else
        log_error "Failed to restore workspace"
        # Restore original if extraction failed
        if [ -d "${backup_existing}" ]; then
            mv "${backup_existing}" "${WORKSPACE_DIR}"
        fi
        return 1
    fi
}

# Restore configuration
restore_config_component() {
    log "Restoring configuration files..."

    # Find most recent config backup
    local config_backup=$(find "${BACKUP_DIR}" -name "config-*.tar.gz" -type f | sort -r | head -1)

    if [ -z "${config_backup}" ]; then
        log "No config backup found"
        return 0
    fi

    log "Using backup: $(basename ${config_backup})"

    if [ "$DRY_RUN" = true ]; then
        log "[DRY RUN] Would restore config from: ${config_backup}"
        return 0
    fi

    # Extract to temp directory
    local temp_dir=$(mktemp -d)
    tar -xzf "${config_backup}" -C "${temp_dir}"

    # Restore env files (with confirmation)
    if [ -d "${temp_dir}/env" ]; then
        log "Restoring environment files..."
        cp -r "${temp_dir}/env"/* "${PROJECT_ROOT}/env/" 2>/dev/null || true
    fi

    # Restore docker-compose files
    for file in ${temp_dir}/docker-compose*.yml; do
        if [ -f "$file" ]; then
            local basename=$(basename "$file")
            log "Restoring ${basename}..."
            cp "$file" "${PROJECT_ROOT}/${basename}"
        fi
    done

    rm -rf "${temp_dir}"

    log_success "Configuration files restored"
    log "⚠ Review configuration files and restart services as needed"

    return 0
}

# Run main function
main "$@"
