#!/bin/bash
# AirGen Remote Backup Setup Script
# Interactive setup for configuring remote backup storage

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        AirGen Remote Backup Configuration                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if restic is installed
if ! command -v restic &> /dev/null; then
    echo "❌ Error: restic is not installed"
    echo "Run: apt-get install -y restic"
    exit 1
fi

echo "Select your backup storage provider:"
echo ""
echo "1) DigitalOcean Spaces (Recommended - $5/month)"
echo "2) AWS S3 (Pay-as-you-go, ~$0.10/month)"
echo "3) Backblaze B2 (Cheapest - ~$0.02/month)"
echo "4) SFTP/SSH (Another server)"
echo "5) Exit"
echo ""

read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        echo "═══ DigitalOcean Spaces Setup ═══"
        echo ""
        echo "Before continuing:"
        echo "1. Log in to DigitalOcean"
        echo "2. Create a Space (Spaces → Create)"
        echo "3. Create API keys (API → Spaces Keys → Generate)"
        echo ""
        read -p "Press Enter when ready..."
        echo ""

        read -p "Space name (e.g., airgen-backups): " SPACE_NAME
        read -p "Region (e.g., nyc3, sfo3, fra1): " REGION
        read -p "Access Key ID: " ACCESS_KEY
        read -sp "Secret Access Key: " SECRET_KEY
        echo ""
        read -sp "Encryption password (20+ chars): " RESTIC_PASS
        echo ""
        read -sp "Confirm encryption password: " RESTIC_PASS_CONFIRM
        echo ""

        if [ "$RESTIC_PASS" != "$RESTIC_PASS_CONFIRM" ]; then
            echo "❌ Passwords don't match!"
            exit 1
        fi

        RESTIC_REPO="s3:https://${REGION}.digitaloceanspaces.com/${SPACE_NAME}"

        # Export for current session
        export RESTIC_REPOSITORY="$RESTIC_REPO"
        export RESTIC_PASSWORD="$RESTIC_PASS"
        export AWS_ACCESS_KEY_ID="$ACCESS_KEY"
        export AWS_SECRET_ACCESS_KEY="$SECRET_KEY"
        ;;

    2)
        echo ""
        echo "═══ AWS S3 Setup ═══"
        echo ""
        echo "Before continuing:"
        echo "1. Create S3 bucket in AWS Console"
        echo "2. Create IAM user with S3 permissions"
        echo "3. Generate access keys"
        echo ""
        read -p "Press Enter when ready..."
        echo ""

        read -p "Bucket name: " BUCKET_NAME
        read -p "Region (e.g., us-east-1): " AWS_REGION
        read -p "Access Key ID: " ACCESS_KEY
        read -sp "Secret Access Key: " SECRET_KEY
        echo ""
        read -sp "Encryption password (20+ chars): " RESTIC_PASS
        echo ""

        RESTIC_REPO="s3:s3.amazonaws.com/${BUCKET_NAME}"

        export RESTIC_REPOSITORY="$RESTIC_REPO"
        export RESTIC_PASSWORD="$RESTIC_PASS"
        export AWS_ACCESS_KEY_ID="$ACCESS_KEY"
        export AWS_SECRET_ACCESS_KEY="$SECRET_KEY"
        export AWS_DEFAULT_REGION="$AWS_REGION"
        ;;

    3)
        echo ""
        echo "═══ Backblaze B2 Setup ═══"
        echo ""
        echo "Before continuing:"
        echo "1. Create account at backblaze.com/b2"
        echo "2. Create bucket"
        echo "3. Create application key"
        echo ""
        read -p "Press Enter when ready..."
        echo ""

        read -p "Bucket name: " BUCKET_NAME
        read -p "Account ID (Key ID): " ACCOUNT_ID
        read -sp "Application Key: " APP_KEY
        echo ""
        read -sp "Encryption password (20+ chars): " RESTIC_PASS
        echo ""

        RESTIC_REPO="b2:${BUCKET_NAME}:/"

        export RESTIC_REPOSITORY="$RESTIC_REPO"
        export RESTIC_PASSWORD="$RESTIC_PASS"
        export B2_ACCOUNT_ID="$ACCOUNT_ID"
        export B2_ACCOUNT_KEY="$APP_KEY"
        ;;

    4)
        echo ""
        echo "═══ SFTP/SSH Setup ═══"
        echo ""

        read -p "SSH host (user@hostname): " SSH_HOST
        read -p "Remote path: " REMOTE_PATH
        read -sp "Encryption password (20+ chars): " RESTIC_PASS
        echo ""

        RESTIC_REPO="sftp:${SSH_HOST}:${REMOTE_PATH}"

        export RESTIC_REPOSITORY="$RESTIC_REPO"
        export RESTIC_PASSWORD="$RESTIC_PASS"

        echo ""
        echo "Testing SSH connection..."
        if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$SSH_HOST" exit 2>/dev/null; then
            echo "⚠ SSH key not configured. Setting up..."
            echo "Run: ssh-copy-id $SSH_HOST"
            exit 1
        fi
        ;;

    5)
        echo "Exiting..."
        exit 0
        ;;

    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing connection to: $RESTIC_REPO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test connection
if restic snapshots >/dev/null 2>&1; then
    echo "✅ Repository already exists and is accessible"
    echo ""
    restic snapshots
else
    echo "Initializing new repository..."
    if restic init; then
        echo "✅ Repository initialized successfully"
    else
        echo "❌ Failed to initialize repository"
        echo "Check your credentials and try again"
        exit 1
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Saving configuration to /etc/environment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Backup existing environment file
cp /etc/environment /etc/environment.backup-$(date +%Y%m%d-%H%M%S)

# Remove old restic config if exists
sed -i '/^RESTIC_/d' /etc/environment
sed -i '/^AWS_ACCESS_KEY_ID=/d' /etc/environment
sed -i '/^AWS_SECRET_ACCESS_KEY=/d' /etc/environment
sed -i '/^AWS_DEFAULT_REGION=/d' /etc/environment
sed -i '/^B2_ACCOUNT_ID=/d' /etc/environment
sed -i '/^B2_ACCOUNT_KEY=/d' /etc/environment

# Add new config
echo "" >> /etc/environment
echo "# AirGen Remote Backup Configuration (Added $(date))" >> /etc/environment
echo "RESTIC_REPOSITORY=\"$RESTIC_REPOSITORY\"" >> /etc/environment
echo "RESTIC_PASSWORD=\"$RESTIC_PASSWORD\"" >> /etc/environment

case $choice in
    1|2)
        echo "AWS_ACCESS_KEY_ID=\"$AWS_ACCESS_KEY_ID\"" >> /etc/environment
        echo "AWS_SECRET_ACCESS_KEY=\"$AWS_SECRET_ACCESS_KEY\"" >> /etc/environment
        [ -n "$AWS_DEFAULT_REGION" ] && echo "AWS_DEFAULT_REGION=\"$AWS_DEFAULT_REGION\"" >> /etc/environment
        ;;
    3)
        echo "B2_ACCOUNT_ID=\"$B2_ACCOUNT_ID\"" >> /etc/environment
        echo "B2_ACCOUNT_KEY=\"$B2_ACCOUNT_KEY\"" >> /etc/environment
        ;;
esac

echo "✅ Configuration saved"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing first backup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "Run a test backup now? [Y/n]: " RUN_BACKUP

if [[ "$RUN_BACKUP" =~ ^[Yy]?$ ]]; then
    echo ""
    echo "Running weekly backup (includes remote upload)..."
    /root/airgen/scripts/backup-weekly.sh

    echo ""
    echo "Verifying remote backup..."
    restic snapshots

    echo ""
    echo "Repository statistics:"
    restic stats --mode raw-data
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              ✅ Remote Backup Configured!                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Configuration:"
echo "  Repository: $RESTIC_REPOSITORY"
echo "  Encrypted:  Yes (with your password)"
echo ""
echo "Your weekly backups (Sunday 3 AM) will now automatically upload"
echo "to remote storage and retain 12 weeks of history."
echo ""
echo "Useful commands:"
echo "  restic snapshots              - List all backups"
echo "  restic check                  - Verify integrity"
echo "  restic stats --mode raw-data  - Show storage usage"
echo ""
echo "Full documentation: /root/airgen/docs/REMOTE_BACKUP_SETUP.md"
echo ""
