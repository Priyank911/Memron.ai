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
 * Users enter their API key here during the OAuth flow.
 */
export function renderLoginPage(requestId: string, error?: string): string {
  const errorHtml = error
    ? `<div class="mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-300 text-sm">${escapeHtml(error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize — Memron MCP</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes gradient { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
    .gradient-bg { background: linear-gradient(-45deg, #0f172a, #1e1b4b, #0c1445, #1a0a2e); background-size: 400% 400%; animation: gradient 15s ease infinite; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in { animation: fadeIn 0.4s ease-out; }
  </style>
</head>
<body class="gradient-bg min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full fade-in">
    <div class="bg-gray-900/80 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-600/20 rounded-2xl mb-4">
          <svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-white">Authorize Memron</h1>
        <p class="text-gray-400 mt-2 text-sm">Enter your API key to connect your MCP client</p>
      </div>

      ${errorHtml}

      <!-- Form -->
      <form id="auth-form" class="space-y-5">
        <input type="hidden" name="request_id" value="${escapeHtml(requestId)}">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">API Key</label>
          <input type="password" name="api_key" id="api-key-input" required
                 placeholder="mm_live_..."
                 autocomplete="off"
                 class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none">
          <p class="text-xs text-gray-500 mt-1.5">Your key is verified securely and never stored in the browser</p>
        </div>

        <div class="flex items-start gap-3 p-3 bg-gray-800/30 rounded-lg border border-gray-800">
          <svg class="w-5 h-5 text-blue-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p class="text-xs text-gray-400">This will grant your MCP client access to read and write memories in your Memron workspace.</p>
        </div>

        <button type="submit" id="submit-btn"
                class="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2">
          <span id="btn-text">Authorize Access</span>
          <svg id="btn-spinner" class="hidden animate-spin w-4 h-4" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
          </svg>
        </button>
      </form>

      <!-- Footer -->
      <div class="mt-6 pt-6 border-t border-gray-800 text-center">
        <p class="text-gray-500 text-sm">
          Don't have an API key?
          <a href="${escapeHtml(config.landingUrl)}/dashboard" target="_blank" rel="noopener"
             class="text-blue-400 hover:text-blue-300 transition-colors">
            Get one from your dashboard &rarr;
          </a>
        </p>
      </div>
    </div>

    <p class="text-center text-gray-600 text-xs mt-4">Memron AI &mdash; Sovereign Memory for AI Agents</p>
  </div>

  <script>
    const form = document.getElementById('auth-form');
    const errorDiv = document.querySelector('[class*="bg-red-900"]');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorDiv) errorDiv.style.display = 'none';
      submitBtn.disabled = true;
      btnText.textContent = 'Verifying...';
      btnSpinner.classList.remove('hidden');

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
          window.location.href = data.redirect;
        } else {
          throw new Error(data.error || 'Authorization failed');
        }
      } catch (err) {
        const errEl = document.createElement('div');
        errEl.className = 'mb-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-300 text-sm';
        errEl.textContent = err.message;
        form.parentNode.insertBefore(errEl, form);
        submitBtn.disabled = false;
        btnText.textContent = 'Authorize Access';
        btnSpinner.classList.add('hidden');
      }
    });
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
