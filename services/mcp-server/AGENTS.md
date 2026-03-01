# Memron MCP — Agent Configuration Guide

> Connect Memron's 9 MCP tools to **any** AI agent. Three auth modes:
> 1. **Direct API key** — `Bearer mm_live_xxx` (works everywhere, simplest)
> 2. **OAuth 2.1** — Browser-based login (VS Code, Cursor, Windsurf)
> 3. **stdio** — Local process (Claude Desktop, Cline, Roo Code)

Replace `YOUR_API_KEY` with your actual key (e.g., `mm_live_NYH50Gvn...`).

---

## 1. Claude Desktop

**File location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

### Option A: Via mcp-remote (recommended — no build needed)

```json
{
  "mcpServers": {
    "memron": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:4201/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

### Option B: Via stdio (direct, fastest)

```json
{
  "mcpServers": {
    "memron": {
      "command": "node",
      "args": ["/path/to/Memron.ai/services/mcp-server/dist/stdio.js"],
      "env": {
        "MEMRON_API_KEY": "YOUR_API_KEY",
        "PG_HOST": "aws-1-ap-south-1.pooler.supabase.com",
        "PG_PORT": "5432",
        "PG_DATABASE": "postgres",
        "PG_USER": "postgres.clfkehjbbvsbllonxrlz",
        "PG_PASSWORD": "YOUR_DB_PASSWORD",
        "ENCRYPTION_SECRET": "YOUR_ENCRYPTION_SECRET",
        "JWT_SECRET": "YOUR_JWT_SECRET"
      }
    }
  }
}
```

---

## 2. VS Code (GitHub Copilot MCP)

**File:** `.vscode/mcp.json` (workspace) or User Settings → `mcp.servers`

```json
{
  "servers": {
    "memron": {
      "type": "http",
      "url": "http://localhost:4201/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

Or via Settings JSON (`Ctrl+Shift+P` → `Preferences: Open User Settings (JSON)`):

```json
{
  "mcp": {
    "servers": {
      "memron": {
        "type": "http",
        "url": "http://localhost:4201/mcp",
        "headers": {
          "Authorization": "Bearer YOUR_API_KEY"
        }
      }
    }
  }
}
```

---

## 3. Cursor

**File:** `.cursor/mcp.json` (project root) or `~/.cursor/mcp.json` (global)

```json
{
  "mcpServers": {
    "memron": {
      "url": "http://localhost:4201/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

Or via stdio:

```json
{
  "mcpServers": {
    "memron": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:4201/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

---

## 4. Windsurf

**File:** `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "memron": {
      "serverUrl": "http://localhost:4201/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

---

## 5. Cline (VS Code Extension)

Open Cline sidebar → Settings (⚙️) → MCP Servers → Add:

```json
{
  "mcpServers": {
    "memron": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:4201/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

Or direct stdio:

```json
{
  "mcpServers": {
    "memron": {
      "command": "node",
      "args": ["/path/to/Memron.ai/services/mcp-server/dist/stdio.js"],
      "env": {
        "PG_HOST": "aws-1-ap-south-1.pooler.supabase.com",
        "PG_PORT": "5432",
        "PG_DATABASE": "postgres",
        "PG_USER": "postgres.clfkehjbbvsbllonxrlz",
        "PG_PASSWORD": "YOUR_DB_PASSWORD",
        "ENCRYPTION_SECRET": "YOUR_ENCRYPTION_SECRET",
        "JWT_SECRET": "YOUR_JWT_SECRET"
      }
    }
  }
}
```

---

## 6. Roo Code

**File:** Roo Code settings → MCP Configuration

```json
{
  "mcpServers": {
    "memron": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:4201/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

---

## 7. Warp Terminal

In Warp, go to Settings → AI → MCP:

```json
{
  "mcpServers": {
    "memron": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:4201/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

---

## 8. OpenAI Codex / ChatGPT

### Via API (programmatic):

```bash
curl -X POST http://localhost:4201/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "openai-codex", "version": "1.0" }
    }
  }'
```

### If Codex supports MCP config:

```json
{
  "mcpServers": {
    "memron": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:4201/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

---

## 9. Gemini (Antigravity)

```json
{
  "mcpServers": {
    "memron": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:4201/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

Or via direct HTTP (if the platform supports it):

```
MCP Endpoint: http://localhost:4201/mcp
Auth Header:  Authorization: Bearer YOUR_API_KEY
```

---

## 10. Qwen

```json
{
  "mcpServers": {
    "memron": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:4201/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}
```

---

## Quick Reference

| Agent | Transport | Auth Method | Config File |
|-------|-----------|-------------|-------------|
| Claude Desktop | stdio / mcp-remote | API key | `claude_desktop_config.json` |
| VS Code (Copilot) | HTTP | API key / OAuth | `.vscode/mcp.json` |
| Cursor | HTTP / stdio | API key / OAuth | `.cursor/mcp.json` |
| Windsurf | HTTP | API key / OAuth | `~/.codeium/windsurf/mcp_config.json` |
| Cline | stdio / mcp-remote | API key | Cline settings UI |
| Roo Code | stdio / mcp-remote | API key | Roo Code settings |
| Warp | mcp-remote | API key | Warp AI settings |
| OpenAI Codex | HTTP / mcp-remote | API key | Platform config |
| Gemini | HTTP / mcp-remote | API key | Platform config |
| Qwen | mcp-remote | API key | Platform config |

---

## Available Tools (9)

| Tool | Description |
|------|-------------|
| `memory_store` | Store encrypted content, get a pointer |
| `memory_search` | Search memories by query/tags/bucket |
| `memory_update` | Update memory (creates forensic snapshot) |
| `memory_delete` | Soft-delete a memory |
| `profile_get` | Get user profile & stats |
| `profile_update` | Update display name |
| `context_build` | Build optimized context from memories |
| `system_health` | Check server health |
| `system_stats` | Memory usage statistics |

---

## Troubleshooting

### "Server not initialized"
The session expired. The agent will auto-reconnect. If not, restart the MCP connection.

### "Missing Authorization header"
Add your API key: `Authorization: Bearer mm_live_xxx`

### "API key not found or revoked"
Generate a new key from the Memron dashboard, or check the key is correct.

### Connection timeout
1. Ensure the MCP server is running: `curl http://localhost:4201/health`
2. Check port isn't blocked: `lsof -i:4201`

### OAuth loop (keeps asking to log in)
Use direct API key auth instead — add `--header "Authorization: Bearer YOUR_API_KEY"` to your config.

### Session expired after idle
Sessions auto-expire after 30 minutes of inactivity. The client will automatically create a new session on next request. No action needed.
