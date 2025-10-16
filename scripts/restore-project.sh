#!/usr/bin/env bash
###############################################################################
# Project Restore Script
#
# Restores a project from a backup file (local or remote).
#
# Usage:
#   ./restore-project.sh <backup-path> [options]
#   ./restore-project.sh --remote <snapshot-id> [options]
#
# Options:
#   --remote <snapshot-id>    Restore from remote RESTIC snapshot
#   --tenant <name>           Target tenant (override backup metadata)
#   --project <key>           Target project key (override backup metadata)
#   --delete-existing         Delete existing project data before restore
#   --dry-run                 Validate backup without restoring
#   --temp                    Restore to temporary project for verification
#   --validate                Only validate backup integrity
#
# Examples:
#   # Restore to original location
#   ./restore-project.sh /backups/projects/acme/brake-system/backup.cypher
#
#   # Restore to different project (migration/cloning)
#   ./restore-project.sh backup.cypher --tenant acme --project brake-system-v2
#
#   # Restore from remote
#   ./restore-project.sh --remote abc123 --tenant acme --project brake-system
#
#   # Restore to temp project for verification
#   ./restore-project.sh backup.cypher --temp
#
#   # Validate backup only
#   ./restore-project.sh backup.cypher --validate
#
#   # Dry run (validate without importing)
#   ./restore-project.sh backup.cypher --dry-run
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
BACKEND_DIR="$PROJECT_ROOT/backend"
TEMP_DIR="/tmp/project-restore-$$"

# Default options
REMOTE=false
SNAPSHOT_ID=""
BACKUP_PATH=""
TARGET_TENANT=""
TARGET_PROJECT=""
DELETE_EXISTING=false
DRY_RUN=false
TEMP=false
VALIDATE=false

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

cleanup() {
  if [[ -d "$TEMP_DIR" ]]; then
    log_info "Cleaning up temporary files..."
    rm -rf "$TEMP_DIR"
  fi
}

trap cleanup EXIT

show_help() {
  cat << EOF
Project Restore Script

Restores a project from a backup file (local or remote).

Usage:
  ./restore-project.sh <backup-path> [options]
  ./restore-project.sh --remote <snapshot-id> [options]

Options:
  --remote <snapshot-id>    Restore from remote RESTIC snapshot
  --tenant <name>           Target tenant (override backup metadata)
  --project <key>           Target project key (override backup metadata)
  --delete-existing         Delete existing project data before restore
  --dry-run                 Validate backup without restoring
  --temp                    Restore to temporary project for verification
  --validate                Only validate backup integrity
  --help                    Show this help message

Examples:
  # Restore to original location
  ./restore-project.sh /backups/projects/acme/brake-system/backup.cypher

  # Restore to different project (migration/cloning)
  ./restore-project.sh backup.cypher --tenant acme --project brake-system-v2

  # Restore from remote
  ./restore-project.sh --remote abc123 --tenant acme --project brake-system

  # Restore to temp project for verification
  ./restore-project.sh backup.cypher --temp

  # Validate backup only
  ./restore-project.sh backup.cypher --validate

  # Dry run (validate without importing)
  ./restore-project.sh backup.cypher --dry-run

Safety:
  - Always test restore in temporary project first (--temp)
  - Use --dry-run to validate before actual import
  - Use --delete-existing carefully - it will remove all existing project data
  - Backups can be imported to different tenant/project (migration/cloning)

Environment Variables:
  RESTIC_REPOSITORY        Remote repository URL
  RESTIC_PASSWORD          Repository password
  AWS_ACCESS_KEY_ID        AWS access key (if using S3)
  AWS_SECRET_ACCESS_KEY    AWS secret key (if using S3)

EOF
}

# ============================================================================
# Parse Arguments
# ============================================================================

if [[ $# -lt 1 ]]; then
  log_error "Missing required arguments"
  echo
  show_help
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      REMOTE=true
      SNAPSHOT_ID="$2"
      shift 2
      ;;
    --tenant)
      TARGET_TENANT="$2"
      shift 2
      ;;
    --project)
      TARGET_PROJECT="$2"
      shift 2
      ;;
    --delete-existing)
      DELETE_EXISTING=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --temp)
      TEMP=true
      shift
      ;;
    --validate)
      VALIDATE=true
      shift
      ;;
    --help)
      show_help
      exit 0
      ;;
    -*)
      log_error "Unknown option: $1"
      show_help
      exit 1
      ;;
    *)
      BACKUP_PATH="$1"
      shift
      ;;
  esac
done

# Validate arguments
if [[ "$REMOTE" == "false" && -z "$BACKUP_PATH" ]]; then
  log_error "Backup path or --remote option required"
  show_help
  exit 1
fi

if [[ "$REMOTE" == "true" && -z "$SNAPSHOT_ID" ]]; then
  log_error "Snapshot ID required with --remote option"
  show_help
  exit 1
fi

# ============================================================================
# Setup
# ============================================================================

log_info "============================================================"
log_info "Project Restore"
log_info "============================================================"

if [[ "$REMOTE" == "true" ]]; then
  log_info "Source:          Remote (RESTIC snapshot)"
  log_info "Snapshot ID:     $SNAPSHOT_ID"
else
  log_info "Source:          Local file"
  log_info "Backup path:     $BACKUP_PATH"
fi

if [[ -n "$TARGET_TENANT" ]]; then
  log_info "Target tenant:   $TARGET_TENANT"
fi

if [[ -n "$TARGET_PROJECT" ]]; then
  log_info "Target project:  $TARGET_PROJECT"
fi

log_info "Delete existing: $DELETE_EXISTING"
log_info "Dry run:         $DRY_RUN"
log_info "Temp restore:    $TEMP"
log_info "Validate only:   $VALIDATE"
log_info "============================================================"
log_info ""

# ============================================================================
# Download from Remote (if needed)
# ============================================================================

if [[ "$REMOTE" == "true" ]]; then
  log_info "Downloading backup from remote storage..."

  # Check RESTIC configuration
  if [[ -z "${RESTIC_REPOSITORY:-}" ]] || [[ -z "${RESTIC_PASSWORD:-}" ]]; then
    log_error "RESTIC not configured. Set RESTIC_REPOSITORY and RESTIC_PASSWORD"
    exit 1
  fi

  mkdir -p "$TEMP_DIR"

  # Restore from RESTIC
  log_info "Repository: $RESTIC_REPOSITORY"
  log_info "Snapshot: $SNAPSHOT_ID"
  log_info ""

  if restic restore "$SNAPSHOT_ID" --target "$TEMP_DIR"; then
    log_info "✓ Download completed"

    # Find the backup file in restored directory
    BACKUP_FILE=$(find "$TEMP_DIR" -type f \( -name "*.cypher" -o -name "*.json" \) | head -n 1)

    if [[ -z "$BACKUP_FILE" ]]; then
      log_error "No backup file found in restored snapshot"
      exit 1
    fi

    BACKUP_PATH="$BACKUP_FILE"
    log_info "Backup file: $BACKUP_PATH"
    log_info ""
  else
    log_error "✗ Failed to download from remote storage"
    exit 1
  fi
fi

# ============================================================================
# Validate Backup File
# ============================================================================

if [[ ! -f "$BACKUP_PATH" ]]; then
  log_error "Backup file not found: $BACKUP_PATH"
  exit 1
fi

log_info "Backup file size: $(du -h "$BACKUP_PATH" | cut -f1)"
log_info ""

# ============================================================================
# Restore Project
# ============================================================================

log_info "Starting project restore..."
log_info ""

# Build CLI command
CLI_CMD="cd $BACKEND_DIR && pnpm cli import-project"
CLI_CMD="$CLI_CMD --input \"$BACKUP_PATH\""

if [[ -n "$TARGET_TENANT" ]]; then
  CLI_CMD="$CLI_CMD --tenant \"$TARGET_TENANT\""
fi

if [[ -n "$TARGET_PROJECT" ]]; then
  CLI_CMD="$CLI_CMD --project \"$TARGET_PROJECT\""
fi

if [[ "$DELETE_EXISTING" == "true" ]]; then
  CLI_CMD="$CLI_CMD --delete-existing"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  CLI_CMD="$CLI_CMD --dry-run"
fi

if [[ "$TEMP" == "true" ]]; then
  CLI_CMD="$CLI_CMD --temp"
fi

if [[ "$VALIDATE" == "true" ]]; then
  CLI_CMD="$CLI_CMD --validate"
fi

# Execute restore
log_info "Executing: $CLI_CMD"
log_info ""

if eval "$CLI_CMD"; then
  log_info ""
  log_info "============================================================"
  log_info "✓ Restore completed successfully"
  log_info "============================================================"
  exit 0
else
  log_error ""
  log_error "============================================================"
  log_error "✗ Restore failed"
  log_error "============================================================"
  exit 1
fi
