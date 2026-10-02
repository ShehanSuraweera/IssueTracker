# Deployment Guide

This document covers the complete production deployment of NewnopDesk on AWS — from account setup to a fully automated CI/CD pipeline.

> **Related docs**
> - [AI Features](ai.md)
> - [Backend README](../backend/README.md)
> - [Frontend README](../frontend/README.md)
> - [CI/CD Workflows](../.github/workflows/)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [AWS IAM Setup](#3-aws-iam-setup)
4. [Networking — Security Groups](#4-networking--security-groups)
5. [Database — RDS PostgreSQL](#5-database--rds-postgresql)
6. [Storage — S3 Buckets](#6-storage--s3-buckets)
7. [Compute — EC2 Instance](#7-compute--ec2-instance)
8. [EC2 Server Configuration](#8-ec2-server-configuration)
9. [CDN — CloudFront Distribution](#9-cdn--cloudfront-distribution)
10. [CI/CD — GitHub Actions](#10-cicd--github-actions)
11. [Environment Variables Reference](#11-environment-variables-reference)
12. [GitHub Secrets Reference](#12-github-secrets-reference)
13. [Operational Runbook](#13-operational-runbook)
14. [Cost Breakdown](#14-cost-breakdown)
15. [AI Service](#15-ai-service)

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                              GitHub                                │
│  Push to main ──► Actions: test + deploy (frontend / backend / AI) │
│                   AI service image ──► GitHub Container Registry   │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                 ┌─────────────▼──────────────┐
                 │       CloudFront CDN        │
                 │   (d1abc123.cloudfront.net) │
                 └──────┬──────────────┬───────┘
                        │              │
              /* (static)          /api/* (dynamic)
                        │              │
                 ┌──────▼──────┐  ┌────▼─────────────────────────────────┐
                 │  S3 Bucket  │  │  EC2 t3.micro (Ubuntu)               │
                 │  (frontend) │  │  Nginx → PM2 → Express + AI worker   │
                 └─────────────┘  │                 │ 127.0.0.1:8000     │
                                  │  Docker: AI service (FastAPI) ───────┼──► Gemini API
                                  └──────────────────┬───────────────────┘
                                                     │
                                       ┌─────────────▼───────────┐
                                       │ RDS PostgreSQL 17       │
                                       │ public: application data│
                                       │ ai: vectors (pgvector)  │
                                       │ (private subnet)        │
                                       └─────────────────────────┘
```

### Request flow

| Request | Path |
|---------|------|
| `GET /` | CloudFront → S3 → `index.html` |
| `GET /issues/APT-0042` | CloudFront → S3 → `index.html` (React Router handles it) |
| `POST /api/auth/login` | CloudFront → EC2 Nginx → Express → RDS |
| File upload | Express → S3 presigned URL (file goes directly to S3) |
| Client raises an issue | Express saves the issue and an AI job in one transaction and responds; the worker then calls the AI service (`127.0.0.1:8000`), which calls Gemini |

### Why this shape

- **S3 + CloudFront** for the frontend means zero server maintenance for static files, global CDN edge caching, and free HTTPS via ACM
- **EC2 + Nginx + PM2** for the backend gives full control, SSH access, and stays on the free tier
- **RDS in a private subnet** means the database is never directly reachable from the internet — only the EC2 can connect to it
- **CloudFront as a single entry point** means one domain serves both the React app and the API, avoiding CORS complexity
- **The AI service as a container on the same EC2** keeps it off the internet (it listens on `127.0.0.1` only), costs nothing extra, and ships as an image built and tested in CI, so the 1 GB server never compiles anything. See [section 15](#15-ai-service).

---

## 2. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 24 LTS | Backend runtime |
| npm | 10+ | Package management |
| AWS CLI | 2.x | Local S3 upload, deployment |
| Git | 2.x | Version control |

**AWS region used:** `ap-south-1` (Mumbai)

---

## 3. AWS IAM Setup

### Why a dedicated IAM user

The root AWS account has unlimited power. A dedicated deployment user with only the required permissions limits the blast radius if credentials are ever leaked.

### Create the deployment user

1. Go to **IAM → Users → Create user**
2. **Username:** `newnopdesk-deploy`
3. **Console access:** No (this user authenticates via access keys only)
4. **Attach policies directly:**
   - `AmazonS3FullAccess`
   - `CloudFrontFullAccess`

> EC2 and RDS do not need API access — the backend deploys via SSH with the `.pem` key, not AWS API calls.

### Generate access keys

1. Click the user → **Security credentials** tab
2. **Create access key** → "Application running outside AWS"
3. **Description:** `GitHub Actions CI/CD — NewnopDesk deploy (S3 + CloudFront)`
4. Download the CSV — the secret key is shown once only

These two values become GitHub Secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

---

## 4. Networking — Security Groups

Two security groups control traffic. Both live in the default VPC.

### `newnopdesk-ec2` — for the backend server

| Direction | Protocol | Port | Source | Purpose |
|-----------|----------|------|--------|---------|
| Inbound | SSH | 22 | `0.0.0.0/0` | SSH from local machine and GitHub Actions runners |
| Inbound | HTTP | 80 | `0.0.0.0/0` | Nginx serves HTTP (CloudFront connects here) |
| Outbound | All | All | `0.0.0.0/0` | npm install, S3, RDS, email |

> SSH is open to all IPs because GitHub Actions runners use dynamic IPs. Authentication is still secure — key-based only, password login is disabled by Ubuntu EC2 defaults.

### `newnopdesk-rds` — for the database

| Direction | Protocol | Port | Source | Purpose |
|-----------|----------|------|--------|---------|
| Inbound | PostgreSQL | 5432 | `newnopdesk-ec2` (SG ID) | Only EC2 instances in that group can connect |
| Outbound | All | All | `0.0.0.0/0` | Standard |

The source for the RDS rule is the **security group ID** of `newnopdesk-ec2` (not an IP). This means the rule applies to any EC2 in that group automatically — so recreating the EC2 doesn't require updating the rule.

---

## 5. Database — RDS PostgreSQL

### Configuration

| Setting | Value |
|---------|-------|
| Engine | PostgreSQL 17 |
| Template | Free tier |
| Instance class | `db.t4g.micro` |
| Storage | 20 GB gp3 |
| Multi-AZ | No (single-AZ) |
| Public access | **No** |
| VPC security group | `newnopdesk-rds` (inbound 5432 from `newnopdesk-ec2`) |
| Master username | `postgres` |
| Initial database name | `newnopdesk` |

The AI features use the **pgvector** extension, which RDS for PostgreSQL 17 supports. The AI service's own database role, its `ai` schema and the extension are created once with `ai-db bootstrap` ([section 15](#15-ai-service)); the application's tables in `public` are untouched.

### TLS: why the connection string needs a CA bundle

RDS for PostgreSQL 15 and later enforces encrypted connections by default (`rds.force_ssl = 1`). The backend's `pg` driver treats `sslmode=require` as `verify-full`, which checks the server certificate against a trusted CA. Amazon's RDS CA is not in Node's default trust store, so `?sslmode=require` on its own fails with `unable to verify the first certificate`.

Download Amazon's CA bundle once on the EC2, outside the repository so deployments never touch it:

```bash
sudo mkdir -p /etc/ssl/rds
sudo curl -fsSL -o /etc/ssl/rds/global-bundle.pem   https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

### Connection string format

```
postgresql://postgres:<password>@<endpoint>:5432/newnopdesk?sslmode=verify-full&sslrootcert=/etc/ssl/rds/global-bundle.pem
```

- URL-encode any special characters in the password (for example `@` becomes `%40`).
- The same string works for the running app and for `prisma migrate deploy`. This was verified against a local PostgreSQL that only accepts TLS connections with a certificate from a private CA.

The endpoint looks like:
```
newnopdesk-db.xxxxxxxxxx.ap-south-1.rds.amazonaws.com
```

### One-time switch from RDS MySQL

The project moved from MySQL 8 to PostgreSQL. If your environment still runs the MySQL version, switch in this order. **Do steps 1–4 before merging the PostgreSQL change into `main`**, because merging triggers a deployment that runs `prisma migrate deploy` against whatever `DATABASE_URL` the EC2 has.

There's no data to migrate: the demo database is rebuilt from the seed. Expect a few minutes between step 5 and step 6 when the app is running against an empty database and nobody can log in.

1. **Create the RDS PostgreSQL instance** with the configuration above.
2. **Allow the EC2 to reach it:** in the `newnopdesk-rds` security group, add inbound PostgreSQL / 5432 from the `newnopdesk-ec2` security group.
3. **Download the CA bundle** on the EC2 (see *TLS* above).
4. **Point the backend at PostgreSQL:** edit `DATABASE_URL` in `/var/www/newnopdesk/backend/.env` to the new connection string. The running server keeps using the old connection until it restarts, so this doesn't take the site down.
5. **Merge the PostgreSQL change into `main`.** The deploy workflow runs the tests, builds, applies the migration to the new database, and restarts the server.
6. **Seed the database** on the EC2:
   ```bash
   cd /var/www/newnopdesk/backend
   npx tsx prisma/seed.ts
   ```
7. **Verify:** log in with each demo account, open an issue, and search. `pm2 logs newnopdesk-api` should show no database errors.
8. **Clean up:** remove the inbound 3306 rule from `newnopdesk-rds`, then delete the RDS MySQL instance. The free tier covers one `db.t4g.micro` instance, so leaving both running is billed.

**If step 5's deployment fails,** the previous build has already been overwritten on disk, but the old process keeps running from memory until PM2 restarts it. Fix the cause and re-run the workflow, or set `DATABASE_URL` back to MySQL and redeploy the previous commit.

### Migrations

Migrations are managed by Prisma and applied automatically on every deployment:

```bash
npx prisma migrate deploy
```

`migrate deploy` is safe to run repeatedly — it skips migrations that have already been applied.

### Seed data

The database ships with seed data for the demo. To re-seed:

```bash
npx tsx prisma/seed.ts
```

**Demo accounts (all passwords: `Demo@2026`)**

| Role | Email | Scope |
|------|-------|-------|
| Admin | `admin@newnop.com` | Full portfolio access |
| Admin | `ops@newnop.com` | Full portfolio access |
| Engineer | `ravindu@newnop.com` | Sri Lanka — APT, APTWEB |
| Engineer | `kasun@newnop.com` | Sri Lanka — APT, D2BIO |
| Engineer | `junho@newnop.com` | Korea — DVL, D2BWEB |
| Engineer | `arjun@newnop.com` | India — D2BIO, D2BWEB |
| Client | `feedback@apartment-lk.com` | Apartment LK |
| Client | `contact@davincilaw.com` | Davinci Law |
| Client | `info@den2bio.com` | Den2bio |

---

## 6. Storage — S3 Buckets

Two buckets serve different purposes.

### `newnopdesk-frontend-ss` — static frontend

- **Region:** `ap-south-1`
- **Public access:** Blocked (CloudFront reads via OAC)
- **Purpose:** Stores the built React app (`frontend/dist/`)
- **Access:** CloudFront Origin Access Control only

After creating the CloudFront distribution, AWS generates a bucket policy to grant CloudFront read access. This policy is applied under **S3 → Permissions → Bucket Policy**.

### `newnopdesk-attachments-ss` — file attachments

- **Region:** `ap-south-1`
- **Public access:** Blocked
- **Purpose:** Stores user-uploaded files (bug screenshots, logs, etc.)
- **Access:** Via presigned URLs generated by the Express API — each URL is time-limited and grants access to a single object only

---

## 7. Compute — EC2 Instance

### Configuration

| Setting | Value |
|---------|-------|
| AMI | Ubuntu Server 24.04 LTS (x86_64) |
| Instance type | `t3.micro` |
| Storage | 20 GB gp3 |
| Security group | `newnopdesk-ec2` |
| Key pair | `newnopdesk-key.pem` |

### Swap file

The t3.micro has 1 GB RAM. `npm ci` can exhaust memory during install. A 2 GB swap file prevents OOM kills:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### SSH access

```bash
chmod 400 ~/.ssh/newnopdesk-key.pem
ssh -i ~/.ssh/newnopdesk-key.pem ubuntu@<EC2_PUBLIC_IP>
```

---

## 8. EC2 Server Configuration

### Software stack

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 24 LTS | Backend runtime |
| PM2 | latest | Process manager — restarts on crash, survives reboots |
| Nginx | 1.28+ | Reverse proxy — routes `/api/*` to Express, handles port 80 |
| Git | 2.53+ | Pull latest code during deployment |
| Docker Engine + Compose plugin | 29+ | Runs the AI service container ([section 15](#15-ai-service)) |

### Installation

```bash
# Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git

# PM2
sudo npm install -g pm2

# Nginx
sudo apt-get install -y nginx
sudo systemctl enable nginx
```

### Application directory

```bash
sudo mkdir -p /var/www/newnopdesk
sudo chown ubuntu:ubuntu /var/www/newnopdesk
cd /var/www/newnopdesk
git clone https://github.com/ShehanSuraweera/IssueTracker.git .
```

> Use a GitHub Personal Access Token (PAT) as the password when cloning:
> `git clone https://<TOKEN>@github.com/ShehanSuraweera/IssueTracker.git .`

### RSA keys for JWT

The backend uses RS256 asymmetric signing. Keys are generated once per environment and never committed to git:

```bash
cd /var/www/newnopdesk/backend
npm install
npm run keys:generate
ls keys/   # private.pem  public.pem
```

These keys persist through all future `git pull` deployments because `keys/` is in `.gitignore`.

### Log directory

```bash
sudo mkdir -p /var/log/newnopdesk
sudo chown ubuntu:ubuntu /var/log/newnopdesk
```

### Environment file

Create `/var/www/newnopdesk/backend/.env`:

```env
NODE_ENV=production
PORT=4000

DATABASE_URL="postgresql://postgres:<password>@<rds-endpoint>:5432/newnopdesk?sslmode=verify-full&sslrootcert=/etc/ssl/rds/global-bundle.pem"

JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=7

CORS_ORIGIN=https://<cloudfront-domain>.cloudfront.net

SEED_ADMIN_EMAIL=admin@newnop.com
SEED_ADMIN_PASSWORD=ChangeMe@Prod1
SEED_DEMO_PASSWORD=Demo@2026

AWS_REGION=ap-south-1
AWS_BUCKET_ATTACHMENTS=newnopdesk-attachments-ss
AWS_ACCESS_KEY_ID=<iam-access-key>
AWS_SECRET_ACCESS_KEY=<iam-secret-key>

# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=<gmail-address>
# SMTP_PASSWORD=<google-app-password>
# SMTP_FROM="NewnopDesk <no-reply@newnop.com>"
```

> `CORS_ORIGIN` must match the CloudFront domain exactly. Update this after CloudFront is created, then restart PM2.

### First deployment (manual)

```bash
cd /var/www/newnopdesk/backend
npm ci
npx prisma generate
npm run build
npx prisma migrate deploy
npx tsx prisma/seed.ts

pm2 start ecosystem.config.js
pm2 save
pm2 startup    # copy and run the command it prints
```

### Nginx configuration

File: `/etc/nginx/sites-available/newnopdesk`

```nginx
server {
    listen 80;
    server_name _;

    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    location /health {
        return 200 'ok';
        add_header Content-Type text/plain;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/newnopdesk /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### PM2 process management

The `ecosystem.config.js` at the repo root defines the process:

```
backend/ecosystem.config.js
```

Key settings:
- `cwd: /var/www/newnopdesk/backend` — ensures `.env` and `./keys/` resolve correctly
- `autorestart: true` — PM2 restarts the process if it crashes
- `max_memory_restart: 256M` — guards against memory leaks on the 1 GB instance
- Logs go to `/var/log/newnopdesk/`

---

## 9. CDN — CloudFront Distribution

### Distribution settings

| Setting | Value |
|---------|-------|
| Distribution name | `newnopdesk` |
| WAF | Disabled |
| Price class | All edge locations |
| Default root object | `index.html` |

### Origins

| Name | Type | Domain |
|------|------|--------|
| `newnopdesk-frontend-ss` | S3 | `newnopdesk-frontend-ss.s3.ap-south-1.amazonaws.com` |
| `newnopdesk-ec2` | Custom (Other) | EC2 public DNS hostname |

The S3 origin uses **Origin Access Control (OAC)** — CloudFront gets a signed identity that S3 trusts. The bucket policy is auto-generated by CloudFront during setup.

### Behaviors

| Path pattern | Origin | Cache policy | Origin request policy |
|---|---|---|---|
| `/api/*` | `newnopdesk-ec2` | CachingDisabled | AllViewer |
| `/*` (default) | S3 bucket | CachingOptimized | CORS-S3Origin |

> `CachingDisabled` on `/api/*` is critical — API responses are user-specific and must never be served from cache.

### SPA routing fix

React Router handles client-side navigation. When a user refreshes `/issues/APT-0042`, CloudFront looks for that file in S3 and gets a 403/404. These custom error responses fix it:

| HTTP error code | Response page path | HTTP response code |
|---|---|---|
| 403 | `/index.html` | 200 |
| 404 | `/index.html` | 200 |

Configure under: **CloudFront → Distribution → Error pages tab**

---

## 10. CI/CD — GitHub Actions

Three independent workflows trigger on push to `main`. Each workflow only runs when its relevant files change, so a frontend-only commit doesn't restart the backend server. The backend and AI service deployments share a concurrency group (`deploy-ec2`), so they never run on the EC2 at the same time.

### Frontend workflow

**File:** `.github/workflows/deploy-frontend.yml`

**Triggers:** changes to `frontend/**`

**Steps:**
1. Checkout code
2. Install Node.js 24
3. `npm ci` in `frontend/`
4. `npm run build` — Vite compiles to `frontend/dist/`
5. Configure AWS credentials (from GitHub Secrets)
6. `aws s3 sync frontend/dist s3://newnopdesk-frontend-ss --delete`
7. `aws cloudfront create-invalidation --paths "/*"` — clears CDN cache

**Why `--delete`:** removes files from S3 that no longer exist in the build output, keeping S3 in exact sync with the latest build.

**Why CloudFront invalidation:** without it, users would see the old version for up to 24 hours due to CDN caching.

### Backend workflow

**File:** `.github/workflows/deploy-backend.yml`

**Triggers:** changes to `backend/**`

**Steps:**
1. Checkout code
2. Install Node.js 24
3. `npm ci` + `npx prisma generate` + `npm run build` — verifies the build compiles cleanly on the runner before touching the server
4. SSH into EC2 via `appleboy/ssh-action`
5. On EC2: `git fetch && git reset --hard origin/main`
6. On EC2: `npm ci` → `npx prisma generate` → `npm run build`
7. On EC2: `npx prisma migrate deploy` — applies any new migrations
8. On EC2: `pm2 restart newnopdesk-api`

**Why build on runner first:** if there's a TypeScript error, the workflow fails before touching the live server. The server is never left in a broken state.

**Why `git reset --hard` instead of `git pull`:** avoids merge conflicts in CI — the server always ends up at exactly the same commit as `origin/main`.

### AI service workflow

**File:** `.github/workflows/deploy-ai-service.yml`

**Triggers:** changes to `ai-service/**` or `deploy/compose.prod.yml`, or manually from the Actions tab

**Steps:**
1. Run `ci-ai-service.yml`: ruff, mypy, pytest. A failure stops the deployment.
2. Build the Docker image on the runner and push it to GitHub Container Registry as `ghcr.io/<owner>/newnopdesk-ai-service:<commit-sha>` (and `:latest`). Delete all but the 5 newest image versions from the registry.
3. Copy `deploy/compose.prod.yml` to `/opt/newnopdesk/` on the EC2.
4. On EC2: log in to the registry with the job's short-lived `GITHUB_TOKEN`, pull the image, and log out when done. No registry credential is stored on the server.
5. On EC2: run `ai-db migrate` in a one-off container from the new image.
6. On EC2: `docker compose up -d --wait`. If the new container isn't healthy within 120 s, start the previous image again and fail the workflow.
7. Remove images other than the current and previous ones.

**Why build in CI:** the image contains ONNX Runtime and an embedding model. Building it on the 1 GB server would be slow and could run out of memory; building once in CI also means the exact image that passed is the one that runs.

**Why tag by commit SHA:** every deployment names the exact code it runs, and a rollback is just starting the previous tag (`/opt/newnopdesk/ai-image.txt` records what's running).

**Migrations must stay backward compatible.** They run before the new container starts, so the previous image (which keeps running if the new one fails) must still work with the migrated schema: add tables and columns, remove them in a later release.

### Deployment timeline

```
git push origin main
        │
        ▼  (~30 seconds)
GitHub Actions detects changed paths
        │
   ┌────┴────┐
   │         │
frontend   backend
   │         │
   │     Verify build on runner (~45s)
   │         │
Build Vite  SSH to EC2
Upload S3   git pull + build + migrate
Invalidate  pm2 restart
CloudFront
   │         │
   └────┬────┘
        ▼  (total ~2 minutes)
Live on CloudFront
```

---

## 11. Environment Variables Reference

All environment variables live in `/var/www/newnopdesk/backend/.env` on the EC2. This file is gitignored and never committed.

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production` |
| `PORT` | Yes | Express listen port (default `4000`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string with `sslmode=verify-full` and `sslrootcert` (see section 5) |
| `JWT_PRIVATE_KEY_PATH` | Yes | Path to RS256 private key (default `./keys/private.pem`) |
| `JWT_PUBLIC_KEY_PATH` | Yes | Path to RS256 public key (default `./keys/public.pem`) |
| `ACCESS_TOKEN_TTL_SECONDS` | Yes | JWT access token lifetime (default `900` = 15 min) |
| `REFRESH_TOKEN_TTL_DAYS` | Yes | Refresh token lifetime (default `7` days) |
| `CORS_ORIGIN` | Yes | CloudFront URL e.g. `https://d1abc123.cloudfront.net` |
| `AWS_REGION` | Optional | `ap-south-1` |
| `AWS_BUCKET_ATTACHMENTS` | Optional | `newnopdesk-attachments-ss` |
| `AWS_ACCESS_KEY_ID` | Optional | IAM key for S3 attachment uploads |
| `AWS_SECRET_ACCESS_KEY` | Optional | IAM secret for S3 attachment uploads |
| `SMTP_HOST` | Optional | `smtp.gmail.com` |
| `SMTP_PORT` | Optional | `587` |
| `SMTP_USER` | Optional | Gmail address for sending notifications |
| `SMTP_PASSWORD` | Optional | Google App Password (not the login password) |
| `SMTP_FROM` | Optional | Display name e.g. `NewnopDesk <no-reply@newnop.com>` |
| `AI_ENABLED` | Optional | `true` to turn on the AI features (default `false`) |
| `AI_SERVICE_URL` | With AI | `http://127.0.0.1:8000` |
| `AI_SERVICE_TOKEN` | With AI | Shared secret, at least 32 characters; must equal the AI service's |
| `AI_TIMEOUT_MS` | Optional | Per-call timeout to the AI service (default `25000`) |
| `AI_WORKER_ENABLED` | Optional | Run the AI job worker in this process (default `true`) |
| `AI_WORKER_POLL_MS` | Optional | How often the worker looks for due jobs (default `3000`) |
| `AI_JOB_MAX_ATTEMPTS` | Optional | Attempts before a job is marked failed (default `5`) |

The AI service has its own environment file, `/etc/newnopdesk/ai-service.env`; see [section 15](#15-ai-service).

---

## 12. GitHub Secrets Reference

Configure at: **GitHub repo → Settings → Secrets and variables → Actions**

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM access key for `newnopdesk-deploy` user |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key for `newnopdesk-deploy` user |
| `S3_FRONTEND_BUCKET` | `newnopdesk-frontend-ss` |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID (e.g. `E1ABC2DEF3GHI`) |
| `EC2_HOST` | EC2 public IPv4 address |
| `EC2_SSH_KEY` | Full contents of `newnopdesk-key.pem` including header and footer lines |

The AI service workflow needs no extra secrets: it pushes and pulls images with the `GITHUB_TOKEN` that GitHub creates for each run, with `packages: write` declared in the workflow. The Gemini API key lives only on the server.

---

## 13. Operational Runbook

### View live server logs

```bash
ssh -i ~/.ssh/newnopdesk-key.pem ubuntu@<EC2_IP>
pm2 logs newnopdesk-api          # tail live logs
pm2 logs newnopdesk-api --lines 100   # last 100 lines
```

Log files on disk:
```
/var/log/newnopdesk/api-out.log    # stdout
/var/log/newnopdesk/api-error.log  # stderr
```

### Restart the server manually

```bash
pm2 restart newnopdesk-api
```

### Check server status

```bash
pm2 status
curl http://localhost:4000/api/auth/me   # should return 401 UNAUTHORIZED
```

### Update environment variables

```bash
nano /var/www/newnopdesk/backend/.env
pm2 restart newnopdesk-api
```

### Re-run database seed

```bash
cd /var/www/newnopdesk/backend
npx tsx prisma/seed.ts
```

> Warning: seed clears existing data before inserting. Only run this on a fresh or test database.

### Roll back a bad deployment

```bash
cd /var/www/newnopdesk/backend
git log --oneline -10          # find the commit to roll back to
git reset --hard <commit-hash>
npx prisma generate
npm run build
pm2 restart newnopdesk-api
```

### Manually deploy frontend

```bash
cd /path/to/localdev
npm run build --prefix frontend
aws s3 sync frontend/dist s3://newnopdesk-frontend-ss --delete
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"
```

### EC2 instance reboots

PM2 is configured with `pm2 startup` to launch automatically on system boot. To verify:

```bash
sudo systemctl status pm2-ubuntu
```

The AI container restarts on boot by itself (`restart: unless-stopped`, and Docker is enabled as a system service).

### AI service

```bash
cd /opt/newnopdesk
export AI_IMAGE=$(cat ai-image.txt)                       # the image that's running

docker compose -f compose.prod.yml ps                     # status and health
docker compose -f compose.prod.yml logs -f --tail 100     # live logs (never contain client text)
curl http://127.0.0.1:8000/healthz                        # {"status":"ok",...,"retrieval":"enabled"}
docker stats --no-stream                                  # memory against the 400 MiB limit
```

**After changing `/etc/newnopdesk/ai-service.env`:** `docker compose -f compose.prod.yml up -d --force-recreate`

**Roll back by hand:** run the previous image (find tags with `docker images`):

```bash
AI_IMAGE=ghcr.io/<owner>/newnopdesk-ai-service:<previous-sha> \
  docker compose -f compose.prod.yml up -d --wait
echo ghcr.io/<owner>/newnopdesk-ai-service:<previous-sha> > ai-image.txt
```

**Turn the AI features off** without touching the container: set `AI_ENABLED=false` in the backend `.env` and `pm2 restart newnopdesk-api`. The app hides every AI panel and queues no AI work.

**After re-seeding or restoring the database:**

```bash
cd /var/www/newnopdesk/backend
npm run ai:reindex     # rebuild the similar-issue index
npm run ai:backfill    # triage and sentiment for issues saved without AI (calls Gemini, ~7 min for the seed)
```

**AI usage and acceptance rate:** see the SQL in [docs/ai.md](ai.md#6-audit-trail-and-measuring-usefulness).

---

## 14. Cost Breakdown

All resources run within the AWS Free Tier (first 12 months).

| Service | Configuration | Free tier | Monthly cost |
|---------|--------------|-----------|-------------|
| EC2 | t3.micro, Ubuntu | 750 hrs/month | $0 |
| RDS | db.t4g.micro, PostgreSQL 17 | 750 hrs + 20 GB | $0 |
| S3 | < 5 GB combined | 5 GB free | < $0.50 |
| CloudFront | Demo-scale traffic | 1 TB egress/month free | $0 |
| Gemini API | `gemini-3.5-flash-lite`, demo traffic | Free tier | $0 (about $0.90 per 1,000 issues on the paid tier) |
| GitHub Container Registry | 5 image versions kept | Free for public packages | $0 |
| Data transfer | Demo scale | 1 GB egress free | $0 |
| **Total** | | | **< $0.50/month** |

After the free tier expires (12 months), estimated cost is approximately $15–20/month for the same configuration.

---

## 15. AI Service

The AI service runs as a Docker container on the same EC2 as the backend. It listens on `127.0.0.1:8000` only, so it is reachable from the backend but not from the internet, and it needs no Nginx route or security group change. Design and safety are covered in [docs/ai.md](ai.md).

### Memory budget

The t3.micro has 1 GB of RAM. Measured and configured limits:

| Process | Memory | Limit |
|---|---|---|
| Ubuntu + system services | ~150 MB | – |
| Docker daemon | ~80 MB | – |
| Express API (PM2) | ~150–250 MB | PM2 restarts it at 256 MB |
| Nginx | ~10 MB | – |
| AI service container | ~280 MB steady, **293 MB peak** measured | 400 MB (`mem_limit`), restarted if exceeded |

That's about 900 MB in the worst case, with the 2 GB swap file ([section 7](#7-compute--ec2-instance)) as a safety margin. Most of the AI service's memory is the embedding model and ONNX Runtime, loaded once at startup.

### One-time setup

**1. Install Docker** on the EC2:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu        # log out and back in for this to apply
sudo systemctl enable docker
docker compose version                # the Compose plugin comes with it
sudo mkdir -p /opt/newnopdesk && sudo chown ubuntu:ubuntu /opt/newnopdesk
```

**2. Create the AI service's environment file.** Generate the service token with `openssl rand -base64 48` and a database password for the `ai_service` role:

```bash
sudo mkdir -p /etc/newnopdesk
sudo install -m 600 -o ubuntu -g ubuntu /dev/null /etc/newnopdesk/ai-service.env
nano /etc/newnopdesk/ai-service.env
```

```env
AI_SERVICE_TOKEN=<same value as in the backend .env>
AI_PROVIDER=gemini
GEMINI_API_KEY=<Google AI Studio key>
AI_MODEL=gemini-3.5-flash-lite
LLM_THINKING_LEVEL=minimal
LLM_TIMEOUT_SECONDS=20
LOG_LEVEL=INFO
AI_SERVICE_DOCS=false

AI_DATABASE_URL=postgresql://ai_service:<ai-service-password>@<rds-endpoint>:5432/newnopdesk?sslmode=verify-full&sslrootcert=/etc/ssl/rds/global-bundle.pem
RETRIEVAL_MIN_SIMILARITY=0.70
RETRIEVAL_MAX_RESULTS=5
```

The CA bundle path is the same inside the container because the compose file mounts `/etc/ssl/rds` read-only. Don't quote values in this file: Docker passes quotes through literally.

**3. Build and push the first image.** Run **Deploy AI service** from the Actions tab. The first run builds and pushes the image, then stops at the migration step because the `ai_service` role doesn't exist yet. That's expected, and nothing has been started on the server.

**4. Create the database role, schema and extension** with the RDS master user. This is the only step that needs admin credentials, and they are typed here, never stored. Pull the image with a GitHub personal access token that has only `read:packages` (or make the package public in its settings and skip the login):

```bash
echo <PAT> | docker login ghcr.io -u <github-username> --password-stdin
docker run --rm --env-file /etc/newnopdesk/ai-service.env \
  -v /etc/ssl/rds:/etc/ssl/rds:ro \
  ghcr.io/<owner>/newnopdesk-ai-service:latest \
  ai-db bootstrap --admin-url 'postgresql://postgres:<master-password>@<rds-endpoint>:5432/newnopdesk?sslmode=verify-full&sslrootcert=/etc/ssl/rds/global-bundle.pem'
docker logout ghcr.io
```

It creates the `ai_service` login role (name and password taken from `AI_DATABASE_URL`), a schema `ai` that it owns, and the `vector` extension inside that schema, and makes sure `ai_service` has no privileges on the application's tables in `public`. The RDS master user isn't a superuser, so bootstrap first adds it to the new role, which PostgreSQL requires before giving that role a schema. Bootstrap is safe to run again, for example to rotate the password.

**5. Deploy.** Re-run the failed workflow (**Re-run failed jobs**). It applies the migrations, starts the container and waits for it to be healthy.

**6. Turn the features on in the backend.** Add to `/var/www/newnopdesk/backend/.env`:

```env
AI_ENABLED=true
AI_SERVICE_URL=http://127.0.0.1:8000
AI_SERVICE_TOKEN=<same value as in ai-service.env>
```

```bash
pm2 restart newnopdesk-api
cd /var/www/newnopdesk/backend
npm run ai:reindex      # index the resolved issues for similar-issue search
npm run ai:backfill     # triage and sentiment for issues created before AI was on
```

**7. Verify:**

```bash
curl http://127.0.0.1:8000/healthz      # "retrieval":"enabled"
pm2 logs newnopdesk-api --lines 50      # "AI worker started", no AI errors
```

Then log in as an engineer, open an issue raised by a client, and check the triage suggestion and client mood panels. Log in as a client and check that no AI panel appears.

From here on, every change to `ai-service/` merged into `main` deploys automatically ([section 10](#ai-service-workflow)).

### Hardening in the compose file

| Setting | Why |
|---|---|
| `127.0.0.1:8000:8000` | Only processes on the EC2 can call it |
| `read_only: true` + `tmpfs: /tmp` | The container can't modify its own code or files |
| `cap_drop: [ALL]`, `no-new-privileges` | No Linux capabilities and no privilege escalation |
| Non-root user (in the image) | Runs as an unprivileged `app` user |
| `mem_limit: 400m`, `cpus: 1.0` | A leak or runaway request can't starve the backend |
| `HF_HUB_OFFLINE=1` (in the image) | The embedding model is baked in; nothing is downloaded at runtime |
| Log rotation (10 MB × 3) | Logs can't fill the disk |
