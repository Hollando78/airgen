#!/usr/bin/env bash
###############################################################################
# Project Backup Script
#
# Backs up a single project to local storage and optionally to remote storage
# using RESTIC.
#
# Usage:
#   ./backup-project.sh <tenant> <projectKey> [options]
#
# Options:
#   --format <cypher|json>    Export format (default: cypher)
#   --skip-versions           Skip version history
#   --skip-baselines          Skip baseline snapshots
#   --compress                Compress output with gzip
#   --remote                  Upload to remote storage after backup
#   --no-local                Only upload to remote (don't keep local copy)
#   --retention               Apply retention policy after backup
#
# Examples:
#   # Basic backup
#   ./backup-project.sh acme brake-system
#
#   # Backup with remote upload
#   ./backup-project.sh acme brake-system --remote
#
#   # Backup to remote only (no local copy)
#   ./backup-project.sh acme brake-system --remote --no-local
#
#   # Backup without version history (smaller file)
#   ./backup-project.sh acme brake-system --skip-versions
###############################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load backup library if available
if [[ -f "$SCRIPT_DIR/backup-lib.sh" ]]; then
  source "$SCRIPT_DIR/backup-lib.sh"
fi

# Configuration
BACKUP_ROOT="${BACKUP_ROOT:-/root/airgen/backups}"
BACKUP_DIR="$BACKUP_ROOT/projects"
BACKEND_DIR="$PROJECT_ROOT/backend"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Default options
FORMAT="cypher"
SKIP_VERSIONS=false
SKIP_BASELINES=false
COMPRESS=false
REMOTE=false
NO_LOCAL=false
RETENTION=false

# ============================================================================
# Functions
# ============================================================================

log_info() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $*"
}

log_warn() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] WARN: $*" >&2
}

log_error() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

show_help() {
  cat << EOF
Project Backup Script

Backs up a single project to local storage and optionally to remote storage.

Usage:
  ./backup-project.sh <tenant> <projectKey> [options]

Options:
  --format <cypher|json>    Export format (default: cypher)
  --skip-versions           Skip version history
  --skip-baselines          Skip baseline snapshots
  --compress                Compress output with gzip
  --remote                  Upload to remote storage after backup
  --no-local                Only upload to remote (don't keep local copy)
  --retention               Apply retention policy after backup
  --help                    Show this help message

Examples:
  # Basic backup
  ./backup-project.sh acme brake-system

  # Backup with remote upload
  ./backup-project.sh acme brake-system --remote

  # Backup to remote only (no local copy)
  ./backup-project.sh acme brake-system --remote --no-local

  # Backup without version history (smaller file)
  ./backup-project.sh acme brake-system --skip-versions

Environment Variables:
  BACKUP_ROOT              Root directory for backups (default: /root/airgen/backups)
  RESTIC_REPOSITORY        Remote repository URL
  RESTIC_PASSWORD          Repository password
  AWS_ACCESS_KEY_ID        AWS access key (if using S3)
  AWS_SECRET_ACCESS_KEY    AWS secret key (if using S3)

EOF
}

# ============================================================================
# Parse Arguments
# ============================================================================

if [[ $# -lt 2 ]]; then
  log_error "Missing required arguments"
  echo
  show_help
  exit 1
fi

TENANT="$1"
PROJECT_KEY="$2"
shift 2

while [[ $# -gt 0 ]]; do
  case "$1" in
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --skip-versions)
      SKIP_VERSIONS=true
      shift
      ;;
    --skip-baselines)
      SKIP_BASELINES=true
      shift
      ;;
    --compress)
      COMPRESS=true
      shift
      ;;
    --remote)
      REMOTE=true
      shift
      ;;
    --no-local)
      NO_LOCAL=true
      shift
      ;;
    --retention)
      RETENTION=true
      shift
      ;;
    --help)
      show_help
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

# Validate format
if [[ "$FORMAT" != "cypher" && "$FORMAT" != "json" ]]; then
  log_error "Invalid format: $FORMAT. Must be 'cypher' or 'json'"
  exit 1
fi

# ============================================================================
# Setup
# ============================================================================

log_info "============================================================"
log_info "Project Backup"
log_info "============================================================"
log_info "Tenant:          $TENANT"
log_info "Project:         $PROJECT_KEY"
log_info "Format:          $FORMAT"
log_info "Skip versions:   $SKIP_VERSIONS"
log_info "Skip baselines:  $SKIP_BASELINES"
log_info "Compress:        $COMPRESS"
log_info "Remote upload:   $REMOTE"
log_info "No local:        $NO_LOCAL"
log_info "Retention:       $RETENTION"
log_info "Timestamp:       $TIMESTAMP"
log_info "============================================================"
log_info ""

# Create backup directory structure
mkdir -p "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR/$TENANT"
mkdir -p "$BACKUP_DIR/$TENANT/$PROJECT_KEY"

# Determine output path
BACKUP_FILENAME="${TENANT}_${PROJECT_KEY}_${TIMESTAMP}.${FORMAT}"
if [[ "$COMPRESS" == "true" ]]; then
  BACKUP_FILENAME="${BACKUP_FILENAME}.gz"
fi

OUTPUT_PATH="$BACKUP_DIR/$TENANT/$PROJECT_KEY/$BACKUP_FILENAME"

log_info "Output path: $OUTPUT_PATH"
log_info ""

# ============================================================================
# Export Project
# ============================================================================

log_info "Starting project export..."

# Build CLI command
CLI_CMD="cd $BACKEND_DIR && pnpm cli export-project"
CLI_CMD="$CLI_CMD --tenant \"$TENANT\""
CLI_CMD="$CLI_CMD --project \"$PROJECT_KEY\""
CLI_CMD="$CLI_CMD --output \"$OUTPUT_PATH\""
CLI_CMD="$CLI_CMD --format \"$FORMAT\""

if [[ "$SKIP_VERSIONS" == "true" ]]; then
  CLI_CMD="$CLI_CMD --skip-versions"
fi

if [[ "$SKIP_BASELINES" == "true" ]]; then
  CLI_CMD="$CLI_CMD --skip-baselines"
fi

if [[ "$COMPRESS" == "true" ]]; then
  CLI_CMD="$CLI_CMD --compress"
fi

# Execute export
log_info "Executing: $CLI_CMD"
log_info ""

if eval "$CLI_CMD"; then
  log_info ""
  log_info "✓ Project export completed successfully"
else
  log_error "✗ Project export failed"
  exit 1
fi

# Check output file exists
if [[ ! -f "$OUTPUT_PATH" ]]; then
  log_error "Backup file not found: $OUTPUT_PATH"
  exit 1
fi

# Get file size
BACKUP_SIZE=$(du -h "$OUTPUT_PATH" | cut -f1)
log_info "Backup size: $BACKUP_SIZE"

# ============================================================================
# Upload to Remote Storage (RESTIC)
# ============================================================================

if [[ "$REMOTE" == "true" ]]; then
  log_info ""
  log_info "============================================================"
  log_info "Remote Upload"
  log_info "============================================================"

  # Check RESTIC configuration
  if [[ -z "${RESTIC_REPOSITORY:-}" ]] || [[ -z "${RESTIC_PASSWORD:-}" ]]; then
    log_error "RESTIC not configured. Set RESTIC_REPOSITORY and RESTIC_PASSWORD"
    log_warn "Backup saved locally but not uploaded to remote storage"
  else
    log_info "Repository: $RESTIC_REPOSITORY"
    log_info ""

    # Backup directory containing the project backup
    BACKUP_PROJECT_DIR="$BACKUP_DIR/$TENANT/$PROJECT_KEY"

    # Upload with RESTIC tags
    log_info "Uploading to remote storage..."

    if restic backup "$BACKUP_PROJECT_DIR" \
      --tag "tenant:$TENANT" \
      --tag "project:$PROJECT_KEY" \
      --tag "format:$FORMAT" \
      --tag "timestamp:$TIMESTAMP" \
      --tag "type:project-backup"; then

      log_info "✓ Remote upload completed successfully"

      # Delete local copy if requested
      if [[ "$NO_LOCAL" == "true" ]]; then
        log_info ""
        log_info "Deleting local copy (--no-local specified)..."
        rm -f "$OUTPUT_PATH"
        rm -f "${OUTPUT_PATH%.${FORMAT}}.metadata.json"
        log_info "✓ Local files deleted"
      fi
    else
      log_error "✗ Remote upload failed"
      log_warn "Backup saved locally: $OUTPUT_PATH"
    fi
  fi
fi

# ============================================================================
# Apply Retention Policy
# ============================================================================

if [[ "$RETENTION" == "true" ]]; then
  log_info ""
  log_info "============================================================"
  log_info "Retention Policy"
  log_info "============================================================"

  # Apply local retention (keep last 7 backups)
  log_info "Applying local retention policy..."

  cd "$BACKUP_DIR/$TENANT/$PROJECT_KEY"
  BACKUP_COUNT=$(ls -1 | wc -l)

  if [[ $BACKUP_COUNT -gt 7 ]]; then
    log_info "Found $BACKUP_COUNT backups, keeping 7 most recent"

    # Delete oldest backups
    ls -1t | tail -n +8 | while read -r old_backup; do
      log_info "Deleting old backup: $old_backup"
      rm -f "$old_backup"
      rm -f "${old_backup%.${FORMAT}}.metadata.json"
    done

    log_info "✓ Retention policy applied"
  else
    log_info "Only $BACKUP_COUNT backups found, no cleanup needed"
  fi

  # Apply remote retention if RESTIC is configured
  if [[ "$REMOTE" == "true" ]] && [[ -n "${RESTIC_REPOSITORY:-}" ]]; then
    log_info ""
    log_info "Applying remote retention policy..."

    if restic forget \
      --tag "tenant:$TENANT" \
      --tag "project:$PROJECT_KEY" \
      --keep-daily 7 \
      --keep-weekly 4 \
      --keep-monthly 6 \
      --prune; then

      log_info "✓ Remote retention policy applied"
    else
      log_warn "Failed to apply remote retention policy"
    fi
  fi
fi

# ============================================================================
# Summary
# ============================================================================

log_info ""
log_info "============================================================"
log_info "Backup Summary"
log_info "============================================================"
log_info "Tenant:          $TENANT"
log_info "Project:         $PROJECT_KEY"
log_info "Backup file:     $OUTPUT_PATH"
log_info "File size:       $BACKUP_SIZE"
log_info "Format:          $FORMAT"

if [[ "$NO_LOCAL" == "true" && "$REMOTE" == "true" ]]; then
  log_info "Location:        Remote only"
else
  log_info "Location:        Local"
  if [[ "$REMOTE" == "true" ]]; then
    log_info "                 + Remote"
  fi
fi

log_info "============================================================"
log_info "✓ Backup completed successfully"
log_info "============================================================"

exit 0
