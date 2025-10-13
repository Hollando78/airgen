#!/bin/bash
# AirGen Weekly Backup Script
# Performs full weekly backups with Docker volume snapshots
# Retention: 4 weeks locally, 12 weeks remote (if configured)

set -eo pipefail

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/backup-lib.sh"

# Source environment variables for remote backup configuration
if [ -f /etc/environment ]; then
    set -a  # Automatically export all variables
    source /etc/environment
    set +a
fi

# Remote backup configuration (optional)
# Set these environment variables to enable remote backups:
# - RESTIC_REPOSITORY: s3:s3.amazonaws.com/bucket or similar
# - RESTIC_PASSWORD: encryption password
# - AWS_ACCESS_KEY_ID: for S3
# - AWS_SECRET_ACCESS_KEY: for S3
REMOTE_ENABLED=false
if [ -n "${RESTIC_REPOSITORY}" ] && [ -n "${RESTIC_PASSWORD}" ]; then
    REMOTE_ENABLED=true
fi

# Main backup function
main() {
    local backup_start=$(date +%s)
    local backup_week="week-$(date +%Y-W%V)"
    local backup_week_dir="${BACKUP_WEEKLY_DIR}/${backup_week}"
    local backup_success=true

    log "========================================"
    log "Starting weekly backup: ${TIMESTAMP}"
    log "Backup directory: ${backup_week_dir}"
    log "Remote backup: ${REMOTE_ENABLED}"
    log "========================================"

    # Create backup directory
    mkdir -p "${backup_week_dir}"

    # Run pre-backup checks
    if ! pre_backup_checks; then
        log_error "Pre-backup checks failed, aborting backup"
        send_notification "AirGen Weekly Backup Failed" "Pre-checks failed" 2
        exit 1
    fi

    # Check disk space (need more for weekly)
    if ! check_disk_space 3; then
        log_error "Insufficient disk space for weekly backup"
        send_notification "AirGen Weekly Backup Failed" "Insufficient disk space" 2
        exit 1
    fi

    # Track backup files
    local backup_files=()

    # Step 1: Backup Neo4j (database dump)
    log "Step 1/5: Backing up Neo4j database..."
    if neo4j_file=$(backup_neo4j "${backup_week_dir}"); then
        neo4j_file=$(printf "%s" "${neo4j_file}" | tail -n 1)
        backup_files+=("${neo4j_file}")
    else
        backup_success=false
    fi

    # Step 2: Backup Neo4j Volume (full snapshot)
    log "Step 2/5: Creating Neo4j volume snapshot..."
    if neo4j_vol=$(backup_volume "${backup_week_dir}" "${NEO4J_VOLUME}" "neo4j-volume"); then
        neo4j_vol=$(printf "%s" "${neo4j_vol}" | tail -n 1)
        backup_files+=("${neo4j_vol}")
    else
        backup_success=false
    fi

    # Step 3: Backup PostgreSQL
    log "Step 3/5: Backing up PostgreSQL..."
    if postgres_file=$(backup_postgres "${backup_week_dir}"); then
        postgres_file=$(printf "%s" "${postgres_file}" | tail -n 1)
        backup_files+=("${postgres_file}")
    fi

    # Backup PostgreSQL volume if container is running
    if check_container_running "${POSTGRES_CONTAINER}"; then
        if postgres_vol=$(backup_volume "${backup_week_dir}" "${POSTGRES_VOLUME}" "postgres-volume"); then
            postgres_vol=$(printf "%s" "${postgres_vol}" | tail -n 1)
            backup_files+=("${postgres_vol}")
        fi
    fi

    # Step 4: Backup Workspace (DEPRECATED - Phase 2 migration complete)
    # Workspace is no longer written to; Neo4j is single source of truth
    log "Step 4/5: Workspace backup (deprecated)..."
    if workspace_file=$(backup_workspace "${backup_week_dir}"); then
        workspace_file=$(printf "%s" "${workspace_file}" | tail -n 1)
        backup_files+=("${workspace_file}")
        # Skip verification for deprecated workspace backup
    else
        log "Workspace backup skipped (non-critical)"
    fi

    # Step 5: Backup Configuration
    log "Step 5/5: Backing up configuration..."
    if config_file=$(backup_config "${backup_week_dir}"); then
        config_file=$(printf "%s" "${config_file}" | tail -n 1)
        backup_files+=("${config_file}")
    fi

    # Create manifest
    create_manifest "${backup_week_dir}" "${backup_files[@]}"

    # Upload to remote storage if configured
    if [ "$REMOTE_ENABLED" = true ]; then
        upload_to_remote "${backup_week_dir}"
    else
        log "Remote backup not configured (set RESTIC_REPOSITORY and RESTIC_PASSWORD)"
    fi

    # Cleanup old local backups
    cleanup_old_weekly_backups

    # Calculate stats
    local backup_end=$(date +%s)
    local duration=$((backup_end - backup_start))
    local total_size=$(du -sh "${backup_week_dir}" | cut -f1)

    # Final status
    if [ "$backup_success" = true ]; then
        log "========================================"
        log_success "Weekly backup completed successfully"
        log "Duration: ${duration} seconds"
        log "Total size: ${total_size}"
        log "Files backed up: ${#backup_files[@]}"
        log "========================================"

        send_notification "AirGen Weekly Backup Success" "Backup completed: ${total_size} in ${duration}s" 0
        exit 0
    else
        log "========================================"
        log_error "Weekly backup completed with errors"
        log "Duration: ${duration} seconds"
        log "========================================"

        send_notification "AirGen Weekly Backup Warning" "Backup completed with errors" 1
        exit 1
    fi
}

# Backup Docker volume
backup_volume() {
    local backup_dir="$1"
    local volume_name="$2"
    local prefix="$3"
    local backup_file="${backup_dir}/${prefix}-${TIMESTAMP}.tar.gz"

    log "Creating snapshot of Docker volume: ${volume_name}..."

    # Check if volume exists
    if ! docker volume inspect "${volume_name}" >/dev/null 2>&1; then
        log_error "Volume not found: ${volume_name}"
        return 1
    fi

    # Create temporary container to access volume
    local temp_container="backup-temp-$(date +%s)"

    if docker run --rm \
        --name "${temp_container}" \
        -v "${volume_name}:/data:ro" \
        -v "${backup_dir}:/backup" \
        alpine \
        tar czf "/backup/$(basename ${backup_file})" -C /data . 2>/dev/null; then

        local size=$(du -h "${backup_file}" | cut -f1)
        log_success "Volume snapshot created: ${backup_file} (${size})"
        echo "${backup_file}"
        return 0
    else
        log_error "Failed to create volume snapshot: ${volume_name}"
        return 1
    fi
}

# Upload to remote storage using restic
upload_to_remote() {
    local local_dir="$1"

    log "Uploading backup to remote storage..."

    # Initialize repository if it doesn't exist
    if ! restic snapshots >/dev/null 2>&1; then
        log "Initializing restic repository..."
        if ! restic init; then
            log_error "Failed to initialize restic repository"
            return 1
        fi
    fi

    # Backup to restic
    if restic backup "${local_dir}" \
        --tag "weekly" \
        --tag "airgen" \
        --tag "$(hostname)" \
        --exclude "*.log"; then

        log_success "Backup uploaded to remote storage"

        # Prune old backups (keep 12 weeks)
        log "Pruning old remote backups..."
        restic unlock >/dev/null 2>&1 || log "No stale restic locks to clear"
        if restic forget \
            --keep-weekly 12 \
            --prune \
            --tag "weekly" 2>&1 | tee -a "${BACKUP_LOG_DIR}/backup.log"; then
            log "Remote backup pruning completed"
        else
            log_error "Restic pruning encountered errors (see log)"
        fi

        return 0
    else
        log_error "Failed to upload backup to remote storage"
        return 1
    fi
}

# Cleanup old weekly backups (keep 4 weeks locally)
cleanup_old_weekly_backups() {
    log "Cleaning up old weekly backups (keeping last ${WEEKLY_RETENTION_WEEKS} weeks)..."

    local count=0
    # Find directories older than 4 weeks
    while IFS= read -r -d '' dir; do
        rm -rf "$dir"
        ((count++))
        log "Removed old weekly backup: $(basename $dir)"
    done < <(find "${BACKUP_WEEKLY_DIR}" -mindepth 1 -maxdepth 1 -type d -mtime +28 -print0 2>/dev/null)

    if [ $count -gt 0 ]; then
        log "Removed ${count} old weekly backup(s)"
    else
        log "No old weekly backups to clean up"
    fi
}

# Create manifest file
create_manifest() {
    local backup_dir="$1"
    shift
    local files=("$@")

    local manifest_file="${backup_dir}/MANIFEST.txt"

    {
        echo "AirGen Weekly Backup Manifest"
        echo "Date: $(date)"
        echo "Hostname: $(hostname)"
        echo "Week: ${backup_week}"
        echo "Remote backup: ${REMOTE_ENABLED}"
        echo "========================================"
        echo ""

        for file in "${files[@]}"; do
            if [ -f "$file" ]; then
                local filename=$(basename "$file")
                local size=$(du -h "$file" | cut -f1)
                local checksum=$(sha256sum "$file" | cut -d' ' -f1)
                echo "File: ${filename}"
                echo "  Size: ${size}"
                echo "  SHA256: ${checksum}"
                echo ""
            fi
        done

        echo "========================================"
        echo "System Information:"
        echo "  Docker volumes:"
        docker volume ls --format "    - {{.Name}}: {{.Driver}}" | grep airgen
        echo ""
        echo "  Running containers:"
        docker ps --format "    - {{.Names}} ({{.Image}})"
        echo ""
        echo "Git State:"
        cd "${PROJECT_ROOT}"
        echo "  Commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
        echo "  Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"

    } > "${manifest_file}"

    log "Manifest created: ${manifest_file}"
}

# Run main function
main "$@"
