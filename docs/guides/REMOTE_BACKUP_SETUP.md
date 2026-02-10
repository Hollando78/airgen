# Remote Backup Setup Guide

## Option 1: DigitalOcean Spaces (Recommended)

### Step 1: Create a Space

1. Log in to DigitalOcean
2. Go to: Spaces Object Storage → Create Space
3. Choose region: `nyc3` or closest to your server
4. Space name: `airgen-backups` (or your choice)
5. Enable CDN: No (not needed for backups)
6. File Listing: Restricted

### Step 2: Create API Keys

1. Go to: API → Spaces Keys → Generate New Key
2. Name: "AirGen Backup Access"
3. **Save the Access Key and Secret Key** (you'll need them below)

### Step 3: Configure Environment Variables

```bash
# Edit the environment file
sudo nano /etc/environment

# Add these lines (replace with your actual values):
RESTIC_REPOSITORY="s3:https://nyc3.digitaloceanspaces.com/airgen-backups"
RESTIC_PASSWORD="your-strong-encryption-password-here"
AWS_ACCESS_KEY_ID="your-spaces-access-key"
AWS_SECRET_ACCESS_KEY="your-spaces-secret-key"

# Save and exit (Ctrl+X, Y, Enter)

# Apply changes
source /etc/environment

# Verify
echo $RESTIC_REPOSITORY
```

**IMPORTANT:** Use a strong RESTIC_PASSWORD - this encrypts your backups!

### Step 4: Initialize Repository

```bash
# Test connection
restic -r $RESTIC_REPOSITORY snapshots

# Initialize (first time only)
restic init

# Verify
restic snapshots
```

### Step 5: Test Backup

```bash
# Run weekly backup script (includes remote upload)
/root/airgen/scripts/backup-weekly.sh

# Check remote snapshots
restic snapshots
```

---

## Option 2: AWS S3

### Step 1: Create S3 Bucket

1. Log in to AWS Console
2. Go to: S3 → Create bucket
3. Bucket name: `airgen-backups-yourcompany` (must be globally unique)
4. Region: Choose closest to your server
5. Block all public access: Yes
6. Versioning: Optional (adds cost but extra protection)
7. Encryption: Enable SSE-S3

### Step 2: Create IAM User

1. Go to: IAM → Users → Add user
2. Username: `airgen-backup-user`
3. Access type: Programmatic access
4. Attach policy: Create inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::airgen-backups-yourcompany"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::airgen-backups-yourcompany/*"
    }
  ]
}
```

5. **Save Access Key ID and Secret Access Key**

### Step 3: Configure Environment

```bash
sudo nano /etc/environment

# Add:
RESTIC_REPOSITORY="s3:s3.amazonaws.com/airgen-backups-yourcompany"
RESTIC_PASSWORD="your-strong-encryption-password"
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_DEFAULT_REGION="us-east-1"  # or your chosen region

source /etc/environment
restic init
```

---

## Option 3: Backblaze B2 (Cheapest)

**Pricing:** $6/TB/month storage, first 10GB free

### Setup

1. Create account at backblaze.com/b2
2. Create bucket: `airgen-backups`
3. Create application key with access to this bucket
4. Note: Key ID, Application Key, Bucket ID

```bash
sudo nano /etc/environment

# Add:
RESTIC_REPOSITORY="b2:airgen-backups:/"
RESTIC_PASSWORD="your-strong-encryption-password"
B2_ACCOUNT_ID="your-key-id"
B2_ACCOUNT_KEY="your-application-key"

source /etc/environment
restic init
```

---

## Option 4: SFTP/SSH to Another Server

If you have another server (like a home server or another VPS):

```bash
sudo nano /etc/environment

# Add:
RESTIC_REPOSITORY="sftp:user@backup-server.com:/path/to/backups"
RESTIC_PASSWORD="your-strong-encryption-password"

source /etc/environment

# Copy SSH key (if not already set up)
ssh-copy-id user@backup-server.com

restic init
```

---

## Verification & Testing

### Check Repository

```bash
# List snapshots
restic snapshots

# Check repository integrity
restic check

# Show repository statistics
restic stats
```

### Test Restore

```bash
# List files in latest snapshot
restic ls latest

# Restore to test directory
mkdir -p /tmp/restore-test
restic restore latest --target /tmp/restore-test

# Verify
ls -lah /tmp/restore-test
```

### Monitor Backup Size

```bash
# Repository size
restic stats --mode raw-data

# Per-snapshot size
restic snapshots --compact
```

---

## Maintenance Commands

### Prune Old Backups

```bash
# Keep 12 weekly backups (already automated in backup-weekly.sh)
restic forget --keep-weekly 12 --prune

# Or manually:
restic forget --keep-daily 7 --keep-weekly 12 --keep-monthly 6 --prune
```

### Check Repository Health

```bash
# Quick check
restic check

# Deep check (reads all data)
restic check --read-data
```

### View Backup History

```bash
# List all snapshots
restic snapshots

# Show what changed in last backup
restic diff <snapshot-id-1> <snapshot-id-2>
```

---

## Security Best Practices

1. **Strong RESTIC_PASSWORD**
   - Use 20+ characters
   - Mix letters, numbers, symbols
   - Store securely (password manager)
   - NEVER commit to git

2. **Rotate Keys Quarterly**
   - Update AWS/DO keys every 3 months
   - Use new RESTIC_PASSWORD for new repo
   - Migrate old backups if needed

3. **Test Restores Monthly**
   - Verify you can actually recover data
   - Document any issues
   - Update procedures

4. **Monitor Storage Costs**
   - Set up billing alerts
   - Check monthly usage
   - Prune aggressively if needed

---

## Troubleshooting

### "Connection refused"
```bash
# Test network connectivity
ping nyc3.digitaloceanspaces.com

# Check firewall
sudo ufw status

# Verify credentials
env | grep RESTIC
env | grep AWS
```

### "Repository not found"
```bash
# Make sure repository is initialized
restic init

# Verify URL format
echo $RESTIC_REPOSITORY
```

### "Access denied"
```bash
# Check credentials are correct
env | grep AWS

# For DO Spaces: verify region matches
# For S3: verify IAM permissions
```

### "Too slow"
```bash
# Limit bandwidth (if needed)
restic backup /path --limit-upload 1000  # KB/s

# Use compression
restic backup /path --compression auto
```

---

## Cost Estimates

### DigitalOcean Spaces
- $5/month for 250GB storage + 1TB transfer
- Your backups: ~600MB/week = 2.4GB/month
- **Estimated cost: $5/month**

### AWS S3 (us-east-1)
- Storage: $0.023/GB/month = $0.055/month (2.4GB)
- PUT requests: $0.005/1000 = ~$0.001/month
- GET requests: Free for retrieval
- **Estimated cost: $0.10/month** (but minimum charge applies)

### Backblaze B2
- Storage: $0.005/GB/month = $0.012/month (2.4GB)
- Download: $0.01/GB (only on restore)
- **Estimated cost: $0.02/month**

All are affordable. DigitalOcean Spaces recommended for simplicity if already using DO.

---

## Next Steps After Setup

1. Run first backup:
   ```bash
   /root/airgen/scripts/backup-weekly.sh
   ```

2. Verify remote storage:
   ```bash
   restic snapshots
   restic check
   ```

3. Set up monitoring alerts (optional)

4. Document recovery procedure for your team

5. Test restore procedure within 1 week

