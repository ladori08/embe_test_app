# Production Deploy Prep (Pre-VPS)

This guide prepares the project for server deployment without changing local dev workflow.

## 1. Files added for production

- `docker-compose.prod.yml`: production-oriented compose file with persistent volumes.
- `.env.prod.example`: production env template.
- `scripts/backup/backup_mongo.sh`: Mongo backup script (`auto|login|manual`) with retention.
- `scripts/backup/restore_mongo.sh`: Mongo restore script.

## 2. Backend configuration now supports env-driven production settings

### CORS

- Property: `EMBE_CORS_ALLOWED_ORIGIN_PATTERNS`
- Example:
  - `https://shop.example.com,https://admin.example.com`

### Auth cookie

- `EMBE_JWT_COOKIE_SECURE` (`true|false`)
- `EMBE_JWT_COOKIE_SAME_SITE` (`Lax|None|Strict`)

Recommended in real HTTPS cross-origin setup:

- `EMBE_JWT_COOKIE_SECURE=true`
- `EMBE_JWT_COOKIE_SAME_SITE=None`

## 3. Pre-VPS dry run on local machine

### 3.1 Create production env file

```bash
cp .env.prod.example .env.prod
```

Then edit `.env.prod` and set at least:

- `JWT_SECRET`
- `NEXT_PUBLIC_API_URL`
- `EMBE_CORS_ALLOWED_ORIGIN_PATTERNS`

### 3.2 Start production compose locally

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

### 3.3 Verify services

- Frontend: `http://localhost:3000`
- Backend API quick check: `http://localhost:8080/api/products/public`

## 4. Backup scripts

## 4.1 Manual backup

```bash
./scripts/backup/backup_mongo.sh manual
```

## 4.2 Auto backup (retained latest 16 by default)

```bash
./scripts/backup/backup_mongo.sh auto
```

## 4.3 Login backup (retained latest 10 by default)

```bash
./scripts/backup/backup_mongo.sh login
```

## 4.4 Restore backup

```bash
./scripts/backup/restore_mongo.sh backups/mongo/manual/<file>.archive.gz
```

`restore_mongo.sh` uses `mongorestore --drop`, so it replaces current DB data.

## 5. Optional Google Drive upload via rclone

Set env before running backup:

```bash
export RCLONE_REMOTE="gdrive:EmbeBackups"
```

Expected remote tree (created automatically):

- `EmbeBackups/auto`
- `EmbeBackups/login`
- `EmbeBackups/manual`

Retention policy in script:

- `auto`: keep latest 16
- `login`: keep latest 10
- `manual`: keep all

## 6. Cron example (every 15 minutes)

```bash
*/15 * * * * cd /path/to/repo && ./scripts/backup/backup_mongo.sh auto >> /var/log/embe-backup.log 2>&1
```

## 7. What to prepare before renting VPS

- Public IP + SSH root/sudo access
- DNS choice (`.onrender.com`, DuckDNS, or purchased domain)
- Final frontend URL (for CORS)
- Final backend URL (for `NEXT_PUBLIC_API_URL`)
- Decide cookie mode for production (`Secure=true`, `SameSite=None` for cross-origin HTTPS)
