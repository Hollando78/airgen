#!/bin/bash
# AirGen Daily Backup Script
# Performs full daily backups of Neo4j, PostgreSQL, workspace, and config
# Retention: 7 days

set -eo pipefail

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/backup-lib.sh"

# Main backup function
main() {
    local backup_start=$(date +%s)
    local backup_date_dir="${BACKUP_DAILY_DIR}/${DATE_ONLY}"
    local backup_success=true

    # Initialize log
    log "========================================"
    log "Starting daily backup: ${TIMESTAMP}"
    log "Backup directory: ${backup_date_dir}"
    log "========================================"

    # Create backup directory
    mkdir -p "${backup_date_dir}"

    # Run pre-backup health checks
    if ! pre_backup_checks; then
        log_error "Pre-backup checks failed, aborting backup"
        send_notification "AirGen Backup Failed" "Daily backup pre-checks failed" 1
        exit 1
    fi

    if ! require_restic_config; then
        log_error "Remote backup configuration missing, aborting daily backup"
        send_notification "AirGen Backup Failed" "Daily backup aborted (restic not configured)" 1
        exit 1
    fi

    # Track backup files
    local backup_files=()

    # Backup Neo4j
    log "Step 1/5: Backing up Neo4j..."
    if neo4j_file=$(backup_neo4j "${backup_date_dir}"); then
        neo4j_file=$(printf "%s" "${neo4j_file}" | tail -n 1)
        backup_files+=("${neo4j_file}")
        verify_backup "${neo4j_file}" || backup_success=false
    else
        backup_success=false
    fi

    # Backup PostgreSQL
    log "Step 2/5: Backing up PostgreSQL..."
    if postgres_file=$(backup_postgres "${backup_date_dir}"); then
        postgres_file=$(printf "%s" "${postgres_file}" | tail -n 1)
        backup_files+=("${postgres_file}")
        verify_backup "${postgres_file}" || backup_success=false
    else
        log "PostgreSQL backup skipped or failed (non-critical)"
    fi

    # Backup Workspace (DEPRECATED - Phase 2 migration complete)
    # Workspace is no longer written to; Neo4j is single source of truth
    log "Step 3/5: Workspace backup (deprecated)..."
    if workspace_file=$(backup_workspace "${backup_date_dir}"); then
        workspace_file=$(printf "%s" "${workspace_file}" | tail -n 1)
        backup_files+=("${workspace_file}")
        # Skip verification for deprecated workspace backup
    else
        log "Workspace backup skipped (non-critical)"
    fi

    # Backup Configuration
    log "Step 4/5: Backing up configuration..."
    if config_file=$(backup_config "${backup_date_dir}"); then
        config_file=$(printf "%s" "${config_file}" | tail -n 1)
        backup_files+=("${config_file}")
        verify_backup "${config_file}" || backup_success=false
    else
        log "Config backup failed (non-critical)"
    fi

    # Create manifest file
    create_manifest "${backup_date_dir}" "${backup_files[@]}"

    # Upload to remote storage
    log "Step 5/5: Uploading backup to remote storage..."
    if restic_backup_directory "${backup_date_dir}" "daily"; then
        if ! restic_prune_for_schedule "daily" --keep-daily ${DAILY_RETENTION_DAYS}; then
            log "Remote retention update encountered warnings"
        fi
    else
        backup_success=false
    fi

    # Cleanup old backups
    cleanup_old_backups "${BACKUP_DAILY_DIR}" ${DAILY_RETENTION_DAYS}

    # Calculate duration and total size
    local backup_end=$(date +%s)
    local duration=$((backup_end - backup_start))
    local total_size=$(du -sh "${backup_date_dir}" | cut -f1)

    # Final status
    if [ "$backup_success" = true ]; then
        log "========================================"
        log_success "Daily backup completed successfully"
        log "Duration: ${duration} seconds"
        log "Total size: ${total_size}"
        log "Files backed up: ${#backup_files[@]}"
        log "========================================"

        send_notification "AirGen Backup Success" "Daily backup completed: ${total_size} in ${duration}s" 0
        exit 0
    else
        log "========================================"
        log_error "Daily backup completed with errors"
        log "Duration: ${duration} seconds"
        log "Check logs for details"
        log "========================================"

        send_notification "AirGen Backup Warning" "Daily backup completed with errors" 1
        exit 1
    fi
}

# Create manifest file with checksums
create_manifest() {
    local backup_dir="$1"
    shift
    local files=("$@")

    local manifest_file="${backup_dir}/MANIFEST.txt"

    {
        echo "AirGen Daily Backup Manifest"
        echo "Date: $(date)"
        echo "Hostname: $(hostname)"
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
        echo "Git State:"
        cd "${PROJECT_ROOT}"
        echo "  Commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
        echo "  Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
        echo "  Status: $(git status --porcelain | wc -l) file(s) modified"

    } > "${manifest_file}"

    log "Manifest created: ${manifest_file}"
}

# Run main function
main "$@"
