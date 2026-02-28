/**
 * OAuth Server Provider — Full OAuth 2.1 + PKCE implementation.
 *
 * This is the brain of the MCP auth system. It handles:
 * 1. /authorize → Stores pending auth → Redirects to login page
 * 2. /token (auth code) → Verifies PKCE → Issues JWT + refresh token
 * 3. /token (refresh) → Verifies refresh token → Issues new JWT
 * 4. Token verification for every MCP request
 *
 * The login page accepts Memron API keys. After verification,
 * it creates an auth code and redirects back to VS Code.
 */
import type { Response } from 'express';
import { nanoid } from 'nanoid';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { MemronClientsStore } from './clients-store.js';
import { MemronTokenVerifier } from './verify.js';
import * as db from '../db/queries.js';
import * as tokens from '../lib/tokens.js';
import { config } from '../config.js';

// Re-export for the SDK interface types
export type AuthorizationParams = {
  state?: string;
  scopes?: string[];
  codeChallenge: string;
  redirectUri: string;
  resource?: URL;
};

export interface OAuthTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
}

/**
 * Implements OAuthServerProvider from the MCP SDK.
 */
export class MemronOAuthProvider {
  public readonly clientsStore: MemronClientsStore;
  private readonly tokenVerifier: MemronTokenVerifier;

  constructor() {
    this.clientsStore = new MemronClientsStore();
    this.tokenVerifier = new MemronTokenVerifier();
  }

  /**
   * Step 1: Begin authorization flow.
   *
   * Called when the client hits GET /authorize.
   * We store the request params and redirect to our login page
   * where the user enters their API key.
   */
  async authorize(
    client: { client_id: string; [key: string]: any },
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const requestId = nanoid(32);

    // Store the pending auth request (expires in 10 minutes)
    await db.insertPendingAuth({
      requestId,
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      state: params.state,
      scopes: params.scopes,
      resource: params.resource?.toString(),
    });

    // Redirect to our login page
    res.redirect(`/auth/login?request_id=${encodeURIComponent(requestId)}`);
  }

  /**
   * Step 2a: Return the code_challenge for PKCE verification.
   *
   * The SDK calls this to get the stored challenge before calling
   * exchangeAuthorizationCode, so it can verify the code_verifier.
   */
  async challengeForAuthorizationCode(
    client: { client_id: string; [key: string]: any },
    authorizationCode: string,
  ): Promise<string> {
    const row = await db.getAuthCode(authorizationCode, client.client_id);
    if (!row) {
      throw new Error('Invalid or expired authorization code');
    }
    return row.code_challenge;
  }

  /**
   * Step 2b: Exchange authorization code for tokens.
   *
   * Called after PKCE is verified. We look up the auth code,
   * issue a JWT access token + refresh token, and return them.
   */
  async exchangeAuthorizationCode(
    client: { client_id: string; [key: string]: any },
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    // Find the auth code
    const authCode = await db.getAuthCode(authorizationCode, client.client_id);
    if (!authCode) {
      throw new Error('Invalid or expired authorization code');
    }

    // Verify redirect URI matches
    if (redirectUri && authCode.redirect_uri !== redirectUri) {
      throw new Error('Redirect URI mismatch');
    }

    // Mark code as used (one-time use per OAuth 2.1)
    await db.markAuthCodeUsed(authorizationCode);

    // Look up the user
    const user = await db.getUserById(authCode.user_id);
    if (!user) {
      throw new Error('User not found');
    }

    // Get user's organization
    const org = await db.getOrgForUser(user.id);

    // Issue access token (JWT)
    const accessToken = await tokens.signAccessToken({
      sub: String(user.id),
      cid: client.client_id,
      org: org ? String(org.org_id) : undefined,
      email: user.email,
      scopes: authCode.scopes,
    });

    // Issue refresh token and store its hash
    const refreshTokenValue = await tokens.signRefreshToken({
      sub: String(user.id),
      cid: client.client_id,
      scopes: authCode.scopes,
    });

    const refreshHash = tokens.hashToken(refreshTokenValue);
    await db.insertRefreshToken({
      tokenHash: refreshHash,
      clientId: client.client_id,
      userId: user.id,
      scopes: authCode.scopes,
      ttlSeconds: config.jwt.refreshTokenTtlSeconds,
    });

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: config.jwt.accessTokenTtlSeconds,
      refresh_token: refreshTokenValue,
      scope: authCode.scopes.join(' '),
    };
  }

  /**
   * Step 3: Exchange refresh token for new access token.
   */
  async exchangeRefreshToken(
    client: { client_id: string; [key: string]: any },
    refreshToken: string,
    scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    // Verify the refresh token JWT
    let refreshPayload;
    try {
      refreshPayload = await tokens.verifyRefreshToken(refreshToken);
    } catch {
      throw new Error('Invalid or expired refresh token');
    }

    // Verify the refresh token hash is in the database and not revoked
    const refreshHash = tokens.hashToken(refreshToken);
    const storedRefresh = await db.getRefreshToken(refreshHash);
    if (!storedRefresh) {
      throw new Error('Refresh token has been revoked');
    }

    // Look up user
    const user = await db.getUserById(storedRefresh.user_id);
    if (!user) {
      throw new Error('User not found');
    }

    const org = await db.getOrgForUser(user.id);
    const grantedScopes = scopes ?? storedRefresh.scopes;

    // Issue new access token
    const newAccessToken = await tokens.signAccessToken({
      sub: String(user.id),
      cid: client.client_id,
      org: org ? String(org.org_id) : undefined,
      email: user.email,
      scopes: grantedScopes,
    });

    // Rotate refresh token: revoke old, issue new
    await db.revokeRefreshToken(refreshHash);

    const newRefreshToken = await tokens.signRefreshToken({
      sub: String(user.id),
      cid: client.client_id,
      scopes: grantedScopes,
    });

    const newRefreshHash = tokens.hashToken(newRefreshToken);
    await db.insertRefreshToken({
      tokenHash: newRefreshHash,
      clientId: client.client_id,
      userId: user.id,
      scopes: grantedScopes,
      ttlSeconds: config.jwt.refreshTokenTtlSeconds,
    });

    return {
      access_token: newAccessToken,
      token_type: 'bearer',
      expires_in: config.jwt.accessTokenTtlSeconds,
      refresh_token: newRefreshToken,
      scope: grantedScopes.join(' '),
    };
  }

  /**
   * Verify an access token. Used by requireBearerAuth middleware
   * on every MCP request.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    return this.tokenVerifier.verifyAccessToken(token);
  }

  /**
   * Revoke a token (optional but recommended).
   */
  async revokeToken(
    _client: { client_id: string; [key: string]: any },
    request: { token: string; token_type_hint?: string },
  ): Promise<void> {
    const tokenHash = tokens.hashToken(request.token);
    // Try revoking as refresh token
    await db.revokeRefreshToken(tokenHash);
  }
}

// ─────────────────────────────────────────────────────────────
// Login Page HTML — Served at GET /auth/login
// ─────────────────────────────────────────────────────────────

/**
 * Generate the HTML login page for MCP OAuth authorization.
 * Styled to match the Memron landing auth pages (Inter + Space Grotesk,
 * white left panel + dark right panel, indigo accents).
 */
export function renderLoginPage(requestId: string, error?: string): string {
  const errorHtml = error
    ? `<div id="server-error" style="padding:10px 14px;margin-bottom:1rem;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;color:#dc2626;font-size:0.85rem;font-family:'Inter',sans-serif;display:flex;align-items:center;gap:8px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
        ${escapeHtml(error)}
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize — Memron MCP</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; overflow: hidden; }
    input::placeholder { color: #a1a1aa !important; }
    input:focus { outline: none !important; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes floatOrb { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(12px, -16px) scale(1.04); } }
    @keyframes pulse { 0%, 100% { opacity: 0.07; } 50% { opacity: 0.11; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    .fade-up { animation: fadeUp 0.65s cubic-bezier(0.16,1,0.3,1) forwards; }
    .fade-up-delay { animation: fadeUp 0.65s 0.15s cubic-bezier(0.16,1,0.3,1) both; }

    /* Input focus ring */
    .input-wrap { display: flex; align-items: center; gap: 10px; background: #fafafa; border: 1.5px solid #e4e4e7; border-radius: 10px; padding: 0 14px; height: 48px; transition: border-color 0.2s, box-shadow 0.2s; }
    .input-wrap:focus-within { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
    .input-wrap input { flex: 1; border: none; background: transparent; font-size: 0.9rem; color: #09090b; font-family: 'Inter', sans-serif; width: 100%; height: 100%; }

    /* Button */
    .btn-primary { width: 100%; height: 48px; border: none; border-radius: 10px; background: #09090b; color: #fff; font-family: 'Inter', sans-serif; font-size: 0.92rem; font-weight: 600; cursor: pointer; letter-spacing: 0.01em; transition: background 0.25s, box-shadow 0.25s, transform 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .btn-primary:hover { background: #18181b; box-shadow: 0 4px 14px rgba(0,0,0,0.13); transform: translateY(-1px); }
    .btn-primary:active { transform: translateY(0); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }

    /* Layout */
    .auth-page { display: flex; min-height: 100vh; width: 100%; }
    .left-panel { flex: 0 0 48%; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #ffffff; padding: 3rem 2.5rem; position: relative; z-index: 10; }
    .right-panel { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-start; background: #09090b; position: relative; padding: 3rem; overflow: hidden; }

    @media (max-width: 1024px) {
      .right-panel { display: none !important; }
      .left-panel { flex: none !important; min-height: 100vh !important; width: 100% !important; }
    }
  </style>
</head>
<body>
  <div class="auth-page">

    <!-- ═══════ LEFT PANEL — WHITE ═══════ -->
    <div class="left-panel">
      <!-- Subtle corner glow -->
      <div style="position:absolute;top:-80px;right:-80px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%);pointer-events:none"></div>

      <div class="fade-up" style="width:100%;max-width:400px">

        <!-- Logo -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:2rem">
          <img src="/logo_b.png" alt="Memron" width="40" height="40" style="object-fit:contain">
          <span style="font-family:'Space Grotesk',sans-serif;font-size:1.35rem;font-weight:700;color:#09090b;letter-spacing:-0.025em">Memron</span>
        </div>

        <!-- Heading -->
        <h1 style="font-family:'Space Grotesk',sans-serif;font-size:1.85rem;font-weight:700;color:#09090b;letter-spacing:-0.03em;margin-bottom:0.4rem">
          Authorize access
        </h1>
        <p style="font-size:0.92rem;color:#71717a;line-height:1.55;margin-bottom:1.75rem">
          Enter your API key to connect your MCP client to Memron.
        </p>

        ${errorHtml}

        <!-- Form -->
        <form id="auth-form" style="display:flex;flex-direction:column;gap:1rem">
          <input type="hidden" name="request_id" value="${escapeHtml(requestId)}">

          <!-- API Key input -->
          <div style="display:flex;flex-direction:column;gap:5px">
            <label style="font-size:0.78rem;font-weight:600;color:#3f3f46;letter-spacing:0.02em">API Key</label>
            <div class="input-wrap">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              <input type="password" name="api_key" id="api-key-input" required
                     placeholder="mm_live_..." autocomplete="off">
              <button type="button" id="toggle-vis" tabindex="-1"
                      style="background:none;border:none;cursor:pointer;color:#a1a1aa;padding:4px;display:flex">
                <svg id="eye-open" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <svg id="eye-closed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
            <p style="font-size:0.75rem;color:#a1a1aa;margin-top:2px">Your key is verified securely and never stored in the browser</p>
          </div>

          <!-- Info box -->
          <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:#eef2ff;border:1px solid #e0e7ff;border-radius:10px">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
            </svg>
            <p style="font-size:0.8rem;color:#4338ca;line-height:1.5">This will grant your MCP client access to read and write memories in your Memron workspace.</p>
          </div>

          <!-- Submit -->
          <button type="submit" id="submit-btn" class="btn-primary">
            <span id="btn-text">Authorize Access</span>
            <svg id="btn-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" style="display:none;animation:spin 0.7s linear infinite">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity=".2"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
            </svg>
          </button>
        </form>

        <!-- Divider -->
        <div style="display:flex;align-items:center;gap:14px;margin-top:1.5rem">
          <div style="flex:1;height:1px;background:#e4e4e7"></div>
          <span style="font-size:0.75rem;color:#a1a1aa;font-weight:500;text-transform:uppercase;letter-spacing:0.06em">need a key?</span>
          <div style="flex:1;height:1px;background:#e4e4e7"></div>
        </div>

        <!-- Footer -->
        <div style="margin-top:1rem;text-align:center">
          <a href="${escapeHtml(config.landingUrl)}/dashboard" target="_blank" rel="noopener"
             style="display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;height:46px;border:1.5px solid #e4e4e7;border-radius:10px;background:#fff;font-size:0.84rem;font-weight:600;color:#09090b;text-decoration:none;transition:all 0.2s;cursor:pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Get one from your dashboard
          </a>
        </div>

        <p style="font-size:0.75rem;color:#a1a1aa;margin-top:1.25rem;text-align:center">
          By continuing, you agree to our
          <a href="${escapeHtml(config.landingUrl)}/terms" style="color:#6366f1;text-decoration:none;font-weight:500">Terms</a>
          and
          <a href="${escapeHtml(config.landingUrl)}/privacy" style="color:#6366f1;text-decoration:none;font-weight:500">Privacy Policy</a>.
        </p>
      </div>
    </div>

    <!-- ═══════ RIGHT PANEL — BLACK ═══════ -->
    <div class="right-panel">
      <!-- Gradient orbs -->
      <div style="position:absolute;top:-25%;right:-15%;width:550px;height:550px;border-radius:50%;background:radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%);animation:floatOrb 9s ease-in-out infinite;pointer-events:none"></div>
      <div style="position:absolute;bottom:-20%;left:-10%;width:450px;height:450px;border-radius:50%;background:radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%);animation:floatOrb 12s ease-in-out infinite reverse;pointer-events:none"></div>

      <!-- Watermark logo -->
      <img src="/logo_w.png" alt="" width="320" height="320" aria-hidden="true" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-55%);object-fit:contain;opacity:0.07;pointer-events:none;animation:pulse 8s ease-in-out infinite">

      <!-- Content -->
      <div class="fade-up-delay" style="position:relative;z-index:1;width:100%;max-width:520px">
        <div style="font-size:0.78rem;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:0.6rem">MCP Authorization</div>

        <h2 style="font-family:'Space Grotesk',sans-serif;font-size:2.25rem;font-weight:700;color:#fafafa;letter-spacing:-0.03em;line-height:1.2;margin-bottom:0.75rem">
          Connect your AI<br>to persistent memory.
        </h2>

        <p style="font-size:0.9rem;color:#a1a1aa;line-height:1.7;margin-bottom:2.25rem;max-width:440px">
          Authorize your MCP client to access Memron's sovereign memory infrastructure.
          Your context follows you across every tool and session.
        </p>

        <!-- Stats -->
        <div style="display:flex;gap:2.5rem;margin-bottom:2.25rem">
          <div style="display:flex;flex-direction:column;gap:2px">
            <div style="font-family:'Space Grotesk',sans-serif;font-size:1.5rem;font-weight:700;color:#fafafa">9<span style="color:#6366f1">+</span></div>
            <div style="font-size:0.72rem;color:#71717a;text-transform:uppercase;letter-spacing:0.06em">MCP Tools</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px">
            <div style="font-family:'Space Grotesk',sans-serif;font-size:1.5rem;font-weight:700;color:#fafafa">E2E<span style="color:#6366f1">*</span></div>
            <div style="font-size:0.72rem;color:#71717a;text-transform:uppercase;letter-spacing:0.06em">Encrypted</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px">
            <div style="font-family:'Space Grotesk',sans-serif;font-size:1.5rem;font-weight:700;color:#fafafa">OAuth<span style="color:#6366f1">2.1</span></div>
            <div style="font-size:0.72rem;color:#71717a;text-transform:uppercase;letter-spacing:0.06em">+ PKCE</div>
          </div>
        </div>

        <!-- Feature card -->
        <div style="background:rgba(255,255,255,0.035);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.06);border-radius:18px;padding:1.5rem 1.75rem;position:relative;overflow:hidden">
          <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg, transparent, #6366f1, transparent);opacity:0.4"></div>
          <h3 style="font-family:'Space Grotesk',sans-serif;font-size:1.1rem;font-weight:600;color:#fafafa;margin-bottom:0.4rem">
            Works with every MCP client
          </h3>
          <p style="font-size:0.83rem;color:#71717a;line-height:1.6;margin-bottom:1.1rem">
            Authorize once and your memory is available in Cursor, Claude Desktop, VS Code Copilot, Windsurf, and any other MCP-compatible client.
          </p>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="display:inline-flex;align-items:center;padding:5px 12px;border-radius:100px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);font-size:0.74rem;font-weight:500;color:#d4d4d8">Cursor</span>
            <span style="display:inline-block;width:3px;height:3px;border-radius:50%;background:#3f3f46"></span>
            <span style="display:inline-flex;align-items:center;padding:5px 12px;border-radius:100px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);font-size:0.74rem;font-weight:500;color:#d4d4d8">Claude</span>
            <span style="display:inline-block;width:3px;height:3px;border-radius:50%;background:#3f3f46"></span>
            <span style="display:inline-flex;align-items:center;padding:5px 12px;border-radius:100px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);font-size:0.74rem;font-weight:500;color:#d4d4d8">Copilot</span>
            <span style="display:inline-block;width:3px;height:3px;border-radius:50%;background:#3f3f46"></span>
            <span style="display:inline-flex;align-items:center;padding:5px 12px;border-radius:100px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);font-size:0.74rem;font-weight:500;color:#d4d4d8">Windsurf</span>
          </div>
        </div>
      </div>
    </div>

  </div>

  <script>
    const form = document.getElementById('auth-form');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');
    const apiKeyInput = document.getElementById('api-key-input');
    const toggleVis = document.getElementById('toggle-vis');
    const eyeOpen = document.getElementById('eye-open');
    const eyeClosed = document.getElementById('eye-closed');

    // Toggle password visibility
    toggleVis.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      eyeOpen.style.display = isPassword ? 'none' : 'block';
      eyeClosed.style.display = isPassword ? 'block' : 'none';
    });

    // Auto-focus the input
    apiKeyInput.focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Remove any previous error
      const prevErr = document.getElementById('client-error');
      if (prevErr) prevErr.remove();
      const serverErr = document.getElementById('server-error');
      if (serverErr) serverErr.style.display = 'none';

      submitBtn.disabled = true;
      btnText.textContent = 'Verifying...';
      btnSpinner.style.display = 'block';

      try {
        const res = await fetch('/auth/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id: form.elements.request_id.value,
            api_key: form.elements.api_key.value,
          }),
        });

        const data = await res.json();
        if (data.redirect) {
          btnText.textContent = 'Redirecting...';
          window.location.href = data.redirect;
        } else {
          throw new Error(data.error || 'Authorization failed');
        }
      } catch (err) {
        const errEl = document.createElement('div');
        errEl.id = 'client-error';
        errEl.style.cssText = 'padding:10px 14px;margin-bottom:1rem;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;color:#dc2626;font-size:0.85rem;display:flex;align-items:center;gap:8px';
        errEl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>' + escapeForDisplay(err.message);
        form.parentNode.insertBefore(errEl, form);
        submitBtn.disabled = false;
        btnText.textContent = 'Authorize Access';
        btnSpinner.style.display = 'none';
        // Shake the button
        submitBtn.style.animation = 'none';
        submitBtn.offsetHeight; // reflow
        submitBtn.style.animation = '';
      }
    });

    function escapeForDisplay(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
