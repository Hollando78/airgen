#!/usr/bin/env bash
###############################################################################
# Backup All Projects Script
#
# Discovers all projects in Neo4j and backs them up individually.
# Useful for scheduled/automated backups of entire system.
#
# Usage:
#   ./backup-all-projects.sh [options]
#
# Options:
#   --format <cypher|json>    Export format (default: cypher)
#   --skip-versions           Skip version history
#   --skip-baselines          Skip baseline snapshots
#   --compress                Compress outputs with gzip
#   --remote                  Upload all backups to remote storage
#   --retention               Apply retention policy after each backup
#   --parallel <N>            Run N backups in parallel (default: 1)
#   --continue-on-error       Continue if individual backup fails
#
# Examples:
#   # Backup all projects
#   ./backup-all-projects.sh
#
#   # Backup all projects with remote upload
#   ./backup-all-projects.sh --remote --retention
#
#   # Backup all projects in parallel (faster)
#   ./backup-all-projects.sh --parallel 3
#
#   # Backup without version history (smaller files)
#   ./backup-all-projects.sh --skip-versions
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
NEO4J_CONTAINER="${NEO4J_CONTAINER:-airgen_neo4j_1}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-}"

# Default options
FORMAT="cypher"
SKIP_VERSIONS=false
SKIP_BASELINES=false
COMPRESS=false
REMOTE=false
RETENTION=false
PARALLEL=1
CONTINUE_ON_ERROR=false

# Stats
TOTAL_PROJECTS=0
SUCCESSFUL_BACKUPS=0
FAILED_BACKUPS=0

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
Backup All Projects Script

Discovers all projects in Neo4j and backs them up individually.

Usage:
  ./backup-all-projects.sh [options]

Options:
  --format <cypher|json>    Export format (default: cypher)
  --skip-versions           Skip version history
  --skip-baselines          Skip baseline snapshots
  --compress                Compress outputs with gzip
  --remote                  Upload all backups to remote storage
  --retention               Apply retention policy after each backup
  --parallel <N>            Run N backups in parallel (default: 1)
  --continue-on-error       Continue if individual backup fails
  --help                    Show this help message

Examples:
  # Backup all projects
  ./backup-all-projects.sh

  # Backup all projects with remote upload
  ./backup-all-projects.sh --remote --retention

  # Backup all projects in parallel (faster)
  ./backup-all-projects.sh --parallel 3

  # Backup without version history (smaller files)
  ./backup-all-projects.sh --skip-versions

Environment Variables:
  NEO4J_CONTAINER          Neo4j Docker container name (default: airgen_neo4j_1)
  NEO4J_USER               Neo4j username (default: neo4j)
  NEO4J_PASSWORD           Neo4j password (required)
  BACKUP_ROOT              Root directory for backups
  RESTIC_REPOSITORY        Remote repository URL
  RESTIC_PASSWORD          Repository password

EOF
}

# ============================================================================
# Parse Arguments
# ============================================================================

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
    --retention)
      RETENTION=true
      shift
      ;;
    --parallel)
      PARALLEL="$2"
      shift 2
      ;;
    --continue-on-error)
      CONTINUE_ON_ERROR=true
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

# ============================================================================
# Setup
# ============================================================================

log_info "============================================================"
log_info "Backup All Projects"
log_info "============================================================"
log_info "Format:          $FORMAT"
log_info "Skip versions:   $SKIP_VERSIONS"
log_info "Skip baselines:  $SKIP_BASELINES"
log_info "Compress:        $COMPRESS"
log_info "Remote upload:   $REMOTE"
log_info "Retention:       $RETENTION"
log_info "Parallel:        $PARALLEL"
log_info "Continue on err: $CONTINUE_ON_ERROR"
log_info "============================================================"
log_info ""

# Check Neo4j password
if [[ -z "$NEO4J_PASSWORD" ]]; then
  # Try to read from environment file
  if [[ -f "$PROJECT_ROOT/.env.production" ]]; then
    NEO4J_PASSWORD=$(grep GRAPH_PASSWORD "$PROJECT_ROOT/.env.production" | cut -d '=' -f2 | tr -d '"' | tr -d "'")
  fi

  if [[ -z "$NEO4J_PASSWORD" ]]; then
    log_error "NEO4J_PASSWORD not set. Set environment variable or add to .env.production"
    exit 1
  fi
fi

# ============================================================================
# Discover All Projects
# ============================================================================

log_info "Discovering projects in Neo4j..."

# Query Neo4j for all unique tenant/project combinations
CYPHER_QUERY="MATCH (p:Project) RETURN DISTINCT p.tenant as tenant, p.key as projectKey ORDER BY tenant, projectKey"

PROJECTS_JSON=$(docker exec "$NEO4J_CONTAINER" \
  cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
  --format plain \
  "$CYPHER_QUERY" \
  | tail -n +2 \
  | grep -v '^$' || true)

if [[ -z "$PROJECTS_JSON" ]]; then
  log_warn "No projects found in Neo4j"
  exit 0
fi

# Parse projects into arrays
declare -a TENANTS
declare -a PROJECT_KEYS

while IFS='|' read -r tenant projectKey; do
  # Trim whitespace
  tenant=$(echo "$tenant" | xargs)
  projectKey=$(echo "$projectKey" | xargs)

  if [[ -n "$tenant" && -n "$projectKey" && "$tenant" != "tenant" ]]; then
    TENANTS+=("$tenant")
    PROJECT_KEYS+=("$projectKey")
    TOTAL_PROJECTS=$((TOTAL_PROJECTS + 1))
  fi
done <<< "$PROJECTS_JSON"

log_info "Found $TOTAL_PROJECTS projects to backup"
log_info ""

if [[ $TOTAL_PROJECTS -eq 0 ]]; then
  log_warn "No projects to backup"
  exit 0
fi

# ============================================================================
# Backup Each Project
# ============================================================================

log_info "============================================================"
log_info "Starting Project Backups"
log_info "============================================================"
log_info ""

# Build backup command options
BACKUP_OPTS="--format $FORMAT"

if [[ "$SKIP_VERSIONS" == "true" ]]; then
  BACKUP_OPTS="$BACKUP_OPTS --skip-versions"
fi

if [[ "$SKIP_BASELINES" == "true" ]]; then
  BACKUP_OPTS="$BACKUP_OPTS --skip-baselines"
fi

if [[ "$COMPRESS" == "true" ]]; then
  BACKUP_OPTS="$BACKUP_OPTS --compress"
fi

if [[ "$REMOTE" == "true" ]]; then
  BACKUP_OPTS="$BACKUP_OPTS --remote"
fi

if [[ "$RETENTION" == "true" ]]; then
  BACKUP_OPTS="$BACKUP_OPTS --retention"
fi

# Function to backup a single project
backup_project() {
  local tenant="$1"
  local projectKey="$2"
  local index="$3"

  log_info "[$index/$TOTAL_PROJECTS] Backing up: $tenant / $projectKey"

  if "$SCRIPT_DIR/backup-project.sh" "$tenant" "$projectKey" $BACKUP_OPTS; then
    log_info "[$index/$TOTAL_PROJECTS] ✓ Success: $tenant / $projectKey"
    return 0
  else
    log_error "[$index/$TOTAL_PROJECTS] ✗ Failed: $tenant / $projectKey"
    return 1
  fi
}

# Backup projects (sequential or parallel)
if [[ $PARALLEL -eq 1 ]]; then
  # Sequential backup
  for i in "${!TENANTS[@]}"; do
    tenant="${TENANTS[$i]}"
    projectKey="${PROJECT_KEYS[$i]}"
    index=$((i + 1))

    if backup_project "$tenant" "$projectKey" "$index"; then
      SUCCESSFUL_BACKUPS=$((SUCCESSFUL_BACKUPS + 1))
    else
      FAILED_BACKUPS=$((FAILED_BACKUPS + 1))

      if [[ "$CONTINUE_ON_ERROR" == "false" ]]; then
        log_error "Backup failed, stopping (use --continue-on-error to continue)"
        break
      fi
    fi

    log_info ""
  done
else
  # Parallel backup using GNU parallel or xargs
  log_info "Running $PARALLEL backups in parallel..."
  log_info ""

  if command -v parallel &> /dev/null; then
    # Use GNU parallel if available
    export -f backup_project
    export -f log_info
    export -f log_error
    export SCRIPT_DIR
    export BACKUP_OPTS
    export TOTAL_PROJECTS

    for i in "${!TENANTS[@]}"; do
      echo "${TENANTS[$i]}|${PROJECT_KEYS[$i]}|$((i + 1))"
    done | parallel -j "$PARALLEL" --colsep '|' backup_project {1} {2} {3}

    # Count results (simplified for parallel)
    SUCCESSFUL_BACKUPS=$TOTAL_PROJECTS
  else
    # Fallback to sequential if parallel not available
    log_warn "GNU parallel not found, falling back to sequential execution"

    for i in "${!TENANTS[@]}"; do
      tenant="${TENANTS[$i]}"
      projectKey="${PROJECT_KEYS[$i]}"
      index=$((i + 1))

      if backup_project "$tenant" "$projectKey" "$index"; then
        SUCCESSFUL_BACKUPS=$((SUCCESSFUL_BACKUPS + 1))
      else
        FAILED_BACKUPS=$((FAILED_BACKUPS + 1))

        if [[ "$CONTINUE_ON_ERROR" == "false" ]]; then
          log_error "Backup failed, stopping"
          break
        fi
      fi

      log_info ""
    done
  fi
fi

# ============================================================================
# Summary
# ============================================================================

log_info ""
log_info "============================================================"
log_info "Backup Summary"
log_info "============================================================"
log_info "Total projects:      $TOTAL_PROJECTS"
log_info "Successful backups:  $SUCCESSFUL_BACKUPS"
log_info "Failed backups:      $FAILED_BACKUPS"
log_info "============================================================"

if [[ $FAILED_BACKUPS -eq 0 ]]; then
  log_info "✓ All backups completed successfully"
  log_info "============================================================"
  exit 0
else
  log_error "✗ Some backups failed"
  log_info "============================================================"
  exit 1
fi
