#!/bin/bash
# AirGen Backup Verification Script
# Verifies integrity of backup files and ensures they can be restored

set -eo pipefail

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/backup-lib.sh"

# Parse arguments
BACKUP_DIR="${1:-${BACKUP_DAILY_DIR}}"
VERBOSE="${2:-false}"

# Verify a single backup directory
verify_single_backup() {
    local backup_dir="$1"
    local dir_verified=true
    local total_size=0

    log "Verifying backup: $(basename ${backup_dir})"

    # Verify each backup file in the directory
    while IFS= read -r -d '' backup_file; do
        if [ "$VERBOSE" = "true" ]; then
            log "  Checking: $(basename ${backup_file})"
        fi

        if verify_backup "${backup_file}"; then
            local size=$(stat -f%z "${backup_file}" 2>/dev/null || stat -c%s "${backup_file}" 2>/dev/null)
            ((total_size+=size))

            if [ "$VERBOSE" = "true" ]; then
                log "    ✓ OK ($(du -h ${backup_file} | cut -f1))"
            fi
        else
            log_error "    ✗ FAILED: $(basename ${backup_file})"
            dir_verified=false
        fi
    done < <(find "${backup_dir}" -type f \( -name "*.gz" -o -name "*.dump" -o -name "*.sql" \) -print0 2>/dev/null)

    # Check manifest
    local manifest="${backup_dir}/MANIFEST.txt"
    if [ -f "${manifest}" ]; then
        verify_manifest "${manifest}"
    else
        log "  Warning: No manifest found"
    fi

    # Print summary
    local total_size_human=$(numfmt --to=iec --suffix=B $total_size 2>/dev/null || echo "${total_size} bytes")

    log "\n========================================"
    log "Verification Summary:"
    log "  Total size: ${total_size_human}"

    if [ "$dir_verified" = true ]; then
        log "  ✓ Backup verified successfully"
        log "========================================"
        log_success "Backup verified successfully"
        exit 0
    else
        log "  ✗ Backup verification failed"
        log "========================================"
        log_error "Backup verification failed"
        exit 1
    fi
}

# Main verification function
main() {
    log "========================================"
    log "Starting backup verification"
    log "Directory: ${BACKUP_DIR}"
    log "========================================"

    if [ ! -d "${BACKUP_DIR}" ]; then
        log_error "Backup directory not found: ${BACKUP_DIR}"
        exit 1
    fi

    local total_backups=0
    local verified_backups=0
    local failed_backups=0
    local total_size=0

    # Check if this is a specific dated backup directory or a parent directory
    # If there are backup files (*.gz, *.dump, *.sql) directly in this directory,
    # treat it as a single backup to verify
    if find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name "*.gz" -o -name "*.dump" -o -name "*.sql" \) -print -quit 2>/dev/null | grep -q .; then
        # This is a specific backup directory with files
        log "Verifying single backup directory"
        verify_single_backup "${BACKUP_DIR}"
        return $?
    fi

    # Find all backup directories
    while IFS= read -r -d '' backup_date_dir; do
        ((total_backups++))
        log "\nVerifying backup: $(basename ${backup_date_dir})"

        local dir_verified=true

        # Verify each backup file in the directory
        while IFS= read -r -d '' backup_file; do
            if [ "$VERBOSE" = "true" ]; then
                log "  Checking: $(basename ${backup_file})"
            fi

            if verify_backup "${backup_file}"; then
                local size=$(stat -f%z "${backup_file}" 2>/dev/null || stat -c%s "${backup_file}" 2>/dev/null)
                ((total_size+=size))

                if [ "$VERBOSE" = "true" ]; then
                    log "    ✓ OK ($(du -h ${backup_file} | cut -f1))"
                fi
            else
                log_error "    ✗ FAILED: $(basename ${backup_file})"
                dir_verified=false
            fi
        done < <(find "${backup_date_dir}" -type f \( -name "*.gz" -o -name "*.dump" -o -name "*.sql" \) -print0 2>/dev/null)

        # Check manifest
        local manifest="${backup_date_dir}/MANIFEST.txt"
        if [ -f "${manifest}" ]; then
            verify_manifest "${manifest}"
        else
            log "  Warning: No manifest found"
        fi

        # Update counters
        if [ "$dir_verified" = true ]; then
            ((verified_backups++))
            log "  ✓ Backup verified successfully"
        else
            ((failed_backups++))
            log_error "  ✗ Backup verification failed"
        fi

    done < <(find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null | sort -z)

    # Print summary
    local total_size_human=$(numfmt --to=iec --suffix=B $total_size 2>/dev/null || echo "${total_size} bytes")

    log "\n========================================"
    log "Verification Summary:"
    log "  Total backups: ${total_backups}"
    log "  Verified: ${verified_backups}"
    log "  Failed: ${failed_backups}"
    log "  Total size: ${total_size_human}"
    log "========================================"

    # Check for old backups
    check_backup_age

    # Exit code
    if [ $failed_backups -gt 0 ]; then
        log_error "Some backups failed verification"
        send_notification "AirGen Backup Verification" "${failed_backups} backup(s) failed verification" 1
        exit 1
    elif [ $total_backups -eq 0 ]; then
        log_error "No backups found"
        send_notification "AirGen Backup Verification" "No backups found!" 2
        exit 1
    else
        log_success "All backups verified successfully"
        exit 0
    fi
}

# Verify manifest checksums
verify_manifest() {
    local manifest="$1"

    if [ "$VERBOSE" = "true" ]; then
        log "  Verifying manifest checksums..."
    fi

    local backup_dir=$(dirname "${manifest}")

    # Extract checksums from manifest and verify
    while read -r line; do
        if [[ $line =~ ^File:\ (.+)$ ]]; then
            local filename="${BASH_REMATCH[1]}"
            local file="${backup_dir}/${filename}"

            # Read next line for checksum
            read -r checksum_line
            if [[ $checksum_line =~ SHA256:\ ([a-f0-9]+)$ ]]; then
                local expected_checksum="${BASH_REMATCH[1]}"

                if [ -f "${file}" ]; then
                    local actual_checksum=$(sha256sum "${file}" | cut -d' ' -f1)

                    if [ "${expected_checksum}" = "${actual_checksum}" ]; then
                        if [ "$VERBOSE" = "true" ]; then
                            log "    ✓ Checksum OK: ${filename}"
                        fi
                    else
                        log_error "    ✗ Checksum mismatch: ${filename}"
                        return 1
                    fi
                fi
            fi
        fi
    done < "${manifest}"

    return 0
}

# Check backup age and warn if too old
check_backup_age() {
    log "\nChecking backup freshness..."

    # Find most recent actual backup file (not directory — directories are created even when backups fail)
    local most_recent_file
    most_recent_file=$(find "${BACKUP_DIR}" -type f \( -name "neo4j-*.tar.gz" -o -name "postgres-*.sql.gz" \) -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2)

    if [ -z "${most_recent_file}" ]; then
        log_error "  No backup files found in ${BACKUP_DIR}!"
        log_error "  Backups may be completely failing — check cron.log"
        send_notification "AirGen Backup CRITICAL" "No backup files found! Backups may be failing." 2
        return
    fi

    local backup_time=$(stat -f%m "${most_recent_file}" 2>/dev/null || stat -c%Y "${most_recent_file}" 2>/dev/null)
    local current_time=$(date +%s)
    local age_hours=$(( (current_time - backup_time) / 3600 ))

    log "  Most recent backup file: $(basename ${most_recent_file})"
    log "  Age: ${age_hours} hours"

    if [ $age_hours -gt 48 ]; then
        log_error "  ⚠ Backup is older than 48 hours!"
        send_notification "AirGen Backup CRITICAL" "Most recent backup is ${age_hours} hours old! Backups may be failing." 2
    elif [ $age_hours -gt 26 ]; then
        log "  ⚠ Backup is older than 24 hours"
        send_notification "AirGen Backup Warning" "Most recent backup is ${age_hours} hours old" 1
    else
        log "  ✓ Backup is recent"
    fi
}

# Run main function
main "$@"
