# Docker Secrets Management

This document describes how secrets are managed in AirGen Studio using Docker Compose file-based secrets.

## Overview

As of October 2025, AirGen has migrated from storing sensitive credentials in `.env` files to using Docker secrets for improved security. Secrets are stored as individual files on the host system and mounted into containers at `/run/secrets/`.

## Architecture

### Secret Storage
- **Location**: `/root/airgen-secrets/`
- **Permissions**: Directory: `700` (drwx------), Files: `600` (-rw-------)
- **Owner**: root
- **Backup**: Secrets directory is excluded from git (`.gitignore`) and should be backed up separately using encrypted storage

### Secret Types

| Secret Name | Purpose | Used By |
|-------------|---------|---------|
| `postgres_password` | PostgreSQL database password | API, Postgres |
| `neo4j_password` | Neo4j graph database password | API, Neo4j |
| `api_jwt_secret` | JWT signing secret for authentication tokens | API |
| `llm_api_key` | OpenAI/LLM API key | API |
| `smtp_password` | Email service password | API |
| `restic_password` | Backup encryption password | API (backup scripts) |
| `aws_secret_access_key` | S3-compatible storage secret key | API (backup scripts) |
| `traefik_basic_auth_users` | Traefik dashboard basic auth | Traefik |

## Implementation

### Docker Compose Configuration

Secrets are defined in `docker-compose.prod.yml`:

```yaml
secrets:
  postgres_password:
    file: /root/airgen-secrets/postgres_password
  neo4j_password:
    file: /root/airgen-secrets/neo4j_password
  # ... etc
```

Services reference secrets they need:

```yaml
services:
  api:
    secrets:
      - postgres_password
      - neo4j_password
      - api_jwt_secret
      - llm_api_key
      - smtp_password
      - restic_password
      - aws_secret_access_key
```

### Backend Configuration

The backend (`backend/src/config.ts`) includes a `getSecret()` helper function that:

1. First checks for Docker secret at `/run/secrets/{secretName}`
2. Falls back to environment variable if secret file doesn't exist
3. Returns `undefined` if neither is available

This design allows:
- **Production**: Use Docker secrets for maximum security
- **Development**: Use environment variables for convenience
- **Graceful degradation**: Works in both modes without code changes

### Database Connection

PostgreSQL supports native secret files via `POSTGRES_PASSWORD_FILE` environment variable. The API service constructs its `DATABASE_URL` by reading the password from `/run/secrets/postgres_password`.

## Security Features

### Current Implementation (File-Based Secrets)

✅ **Pros:**
- Secrets stored as separate files with restricted permissions
- Not exposed in process environment variables
- Compatible with existing docker-compose workflow
- Easy to rotate individual secrets
- No infrastructure changes required

⚠️ **Limitations:**
- Secrets stored as plaintext files on disk
- No encryption at rest
- Accessible to root user on host

### Future Enhancement: Docker Swarm Secrets

For maximum security, consider migrating to Docker Swarm mode:

✅ **Additional Benefits:**
- Secrets encrypted at rest in Raft log
- Encrypted in transit to containers
- Mounted as in-memory files (never written to disk)
- Automatic secret rotation support
- Better compliance with security standards

⚠️ **Trade-offs:**
- Requires Docker Swarm initialization
- Must use `docker stack deploy` instead of `docker-compose up`
- More complex troubleshooting
- Additional operational overhead

## Operations

### Rotating Secrets

To rotate a secret:

1. **Update the secret file:**
   ```bash
   echo "new-secret-value" > /root/airgen-secrets/secret_name
   chmod 600 /root/airgen-secrets/secret_name
   ```

2. **Update the service credential** (if external, like database password):
   ```bash
   # Example for PostgreSQL
   docker exec airgen_postgres_1 psql -U airgen -d airgen -c \
     "ALTER USER airgen WITH PASSWORD 'new-password';"
   ```

3. **Restart affected services:**
   ```bash
   cd /mnt/HC_Volume_103049457/apps/airgen
   docker-compose -f docker-compose.prod.yml --env-file .env.production restart api
   ```

### Backup Strategy

**Critical:** Secret files must be backed up separately from the codebase.

1. **Manual backup:**
   ```bash
   tar -czf airgen-secrets-$(date +%Y%m%d).tar.gz \
     -C /root airgen-secrets/
   ```

2. **Encrypt backup:**
   ```bash
   gpg --symmetric --cipher-algo AES256 \
     airgen-secrets-$(date +%Y%m%d).tar.gz
   ```

3. **Store securely:**
   - Use encrypted cloud storage (not the same as application backups)
   - Store encryption key separately
   - Test restore procedure regularly

### Disaster Recovery

To restore secrets on a new server:

1. **Decrypt and extract backup:**
   ```bash
   gpg --decrypt airgen-secrets-YYYYMMDD.tar.gz.gpg | tar -xzf - -C /root/
   ```

2. **Set correct permissions:**
   ```bash
   chmod 700 /root/airgen-secrets
   chmod 600 /root/airgen-secrets/*
   ```

3. **Verify secrets:**
   ```bash
   ls -la /root/airgen-secrets/
   # Ensure all 8 secret files exist
   ```

4. **Deploy application:**
   ```bash
   cd /mnt/HC_Volume_103049457/apps/airgen
   ./deploy-production.sh
   ```

### Monitoring

Check that secrets are mounted correctly:

```bash
# List mounted secrets in API container
docker exec airgen_api_1 ls -la /run/secrets/

# Verify API can read secrets (shows first 10 chars)
docker exec airgen_api_1 sh -c 'head -c 10 /run/secrets/api_jwt_secret && echo ""'
```

## Troubleshooting

### Secret Not Found Error

**Symptom:** API logs show "Required secrets missing in production"

**Solution:**
1. Check secret file exists: `ls -la /root/airgen-secrets/`
2. Check permissions: `ls -l /root/airgen-secrets/secret_name`
3. Check it's mounted: `docker exec airgen_api_1 ls -la /run/secrets/`
4. Restart service: `docker-compose -f docker-compose.prod.yml restart api`

### Database Connection Failed

**Symptom:** API can't connect to PostgreSQL

**Solution:**
1. Verify password in secret matches database password
2. Update database password if needed:
   ```bash
   PW=$(cat /root/airgen-secrets/postgres_password)
   docker exec airgen_postgres_1 psql -U airgen -d airgen -c \
     "ALTER USER airgen WITH PASSWORD '$PW';"
   ```
3. Restart API: `docker-compose -f docker-compose.prod.yml restart api`

### Secrets Not Mounted in Container

**Symptom:** `/run/secrets/` directory is empty

**Solution:**
1. Check secret paths in `docker-compose.prod.yml` are correct
2. Verify `secrets:` section lists the secret for that service
3. Rebuild and restart:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d --force-recreate api
   ```

## Migration History

- **October 16, 2025**: Migrated from `.env` file storage to Docker Compose file-based secrets
- **Previous**: All secrets stored in `.env.production` file

## Security Checklist

- [x] Secrets stored in separate files with `600` permissions
- [x] Secrets directory has `700` permissions
- [x] Secrets directory added to `.gitignore`
- [x] Backend reads from `/run/secrets/` with env fallback
- [x] Services reference only secrets they need
- [ ] Regular secret rotation schedule established
- [ ] Encrypted backup procedure documented and tested
- [ ] Recovery procedure tested on staging
- [ ] Consider migration to Docker Swarm for enhanced security

## References

- [Docker Compose Secrets Documentation](https://docs.docker.com/compose/use-secrets/)
- [Docker Swarm Secrets Documentation](https://docs.docker.com/engine/swarm/secrets/)
- [Security Best Practices](https://docs.docker.com/engine/security/)
