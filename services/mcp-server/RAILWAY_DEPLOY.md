# Memron MCP Server — Railway Deployment Guide

> Deploy the MCP server to [Railway](https://railway.app) for beta testing while keeping local dev fully functional.

---

## Architecture

| Environment | How it runs | Config source |
|-------------|-------------|---------------|
| **Local dev** | `pnpm dev` (tsx watch) | `.env` file |
| **Railway (beta)** | Nixpacks auto-build | Railway dashboard env vars |
| **Docker** | `Dockerfile.mcp` | `docker run --env-file` |

The server auto-detects Railway via the `RAILWAY_ENVIRONMENT` variable and adjusts:
- `PORT` — Railway assigns dynamically
- `MCP_SERVER_URL` — derived from `RAILWAY_PUBLIC_DOMAIN`
- `NODE_ENV` — defaults to `production` on Railway
- Binds to `0.0.0.0` for external access

---

## 1. Deploy to Railway

### Option A: Railway Dashboard (recommended)

1. Go to [railway.app/new](https://railway.app/new) → **Deploy from GitHub repo**
2. Select the `Priyank911/Memron.ai` repo, branch `feat/mcp-server-supabase`
3. Set **Root Directory** to `/` (project root — required for monorepo)
4. Railway detects `railway.json` settings automatically. If not, manually set:
   - **Build Command:** `corepack enable && pnpm install --frozen-lockfile && pnpm turbo build --filter=@memron/mcp-server`
   - **Start Command:** `node services/mcp-server/dist/index.js`
5. Add environment variables (see section below)
6. Click **Deploy**

### Option B: Railway CLI

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Create project & link
railway init
railway link

# Set root directory (monorepo)
# In the Railway dashboard, set Root Directory to /

# Deploy
railway up
```

### Option C: Docker on Railway

In Railway dashboard, change builder to Dockerfile:
- **Dockerfile Path:** `infra/docker/Dockerfile.mcp`
- **Start Command:** (leave empty — Dockerfile handles it)

---

## 2. Environment Variables (Railway Dashboard)

Go to **Service → Variables** and add:

| Variable | Value | Required |
|----------|-------|----------|
| `NODE_ENV` | `production` | ✅ |
| `PG_HOST` | `aws-1-ap-south-1.pooler.supabase.com` | ✅ |
| `PG_PORT` | `5432` | ✅ |
| `PG_DATABASE` | `postgres` | ✅ |
| `PG_USER` | `postgres.clfkehjbbvsbllonxrlz` | ✅ |
| `PG_PASSWORD` | `(your supabase password)` | ✅ |
| `PG_SSL` | `true` | ✅ |
| `ENCRYPTION_SECRET` | `(32+ char hex — openssl rand -hex 32)` | ✅ |
| `JWT_SECRET` | `(32+ char hex — openssl rand -hex 32)` | ✅ |
| `LANDING_URL` | `https://console.memron.ai` | ✅ |

> **Do NOT set** `PORT` or `MCP_SERVER_URL` — Railway auto-provides them.

A template is available at `.env.railway` for reference.

---

## 3. Verify Deployment

Once deployed, Railway provides a public URL like:
```
https://memron-mcp-production-XXXX.up.railway.app
```

### Health Check
```bash
curl https://YOUR_RAILWAY_URL/health
```
Expected:
```json
{
  "status": "healthy",
  "service": "memron-mcp-server",
  "version": "1.0.0",
  "checks": { "database": "ok", "encryption": "ok" },
  "activeSessions": 0
}
```

### MCP Endpoint
```bash
curl -X POST https://YOUR_RAILWAY_URL/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mm_live_YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
```

### OAuth Discovery
```bash
curl https://YOUR_RAILWAY_URL/.well-known/oauth-authorization-server
```

---

## 4. Local Development (unchanged)

```bash
cd services/mcp-server

# Copy and fill your .env
cp .env.example .env
# Edit .env with your Supabase credentials

# Run with hot reload
pnpm dev

# Or build and run production-like
pnpm build && pnpm start
```

The dev server runs at `http://localhost:4201`.

---

## 5. Agent Configuration for Railway

Update agent configs to point to the Railway URL:

### VS Code / Cursor (settings.json)
```json
{
  "mcpServers": {
    "memron": {
      "url": "https://YOUR_RAILWAY_URL/mcp",
      "headers": {
        "Authorization": "Bearer mm_live_YOUR_API_KEY"
      }
    }
  }
}
```

### Claude Desktop (mcp-remote)
```json
{
  "mcpServers": {
    "memron": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://YOUR_RAILWAY_URL/mcp",
        "--header", "Authorization:Bearer mm_live_YOUR_API_KEY"
      ]
    }
  }
}
```

---

## 6. Monitoring

```bash
# Railway CLI logs
railway logs

# Redeploy after push
railway up

# Or enable auto-deploy in Railway dashboard for the branch
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Deploy fails at install | Ensure `pnpm-lock.yaml` is committed and up to date |
| `Cannot connect to PostgreSQL` | Check `PG_*` env vars in Railway dashboard |
| `Missing ENCRYPTION_SECRET` | Set it in Railway variables (no dev fallback in production) |
| Health check timeout | Increase `healthcheckTimeout` or check DB connectivity |
| `EADDRINUSE` | Don't set `PORT` manually — Railway provides it |
