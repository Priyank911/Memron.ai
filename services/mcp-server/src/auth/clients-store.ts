/**
 * OAuth Client Store — PostgreSQL-backed storage for dynamically registered MCP clients.
 *
 * When VS Code (or any MCP client) connects for the first time, it registers
 * itself via the /register endpoint. This store persists that registration
 * so subsequent connections reuse the same client_id.
 */
import { nanoid } from 'nanoid';
import { createHash } from 'node:crypto';
import * as db from '../db/queries.js';

/**
 * Minimal client info matching what the MCP SDK expects.
 * This is a subset of OAuthClientInformationFull from the SDK.
 */
export interface StoredClient {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
  token_endpoint_auth_method?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
}

/**
 * Implements OAuthRegisteredClientsStore from the MCP SDK.
 * Stores clients in PostgreSQL for durability across server restarts.
 */
export class MemronClientsStore {
  /**
   * Look up a registered client by ID.
   */
  async getClient(clientId: string): Promise<StoredClient | undefined> {
    const row = await db.getOAuthClient(clientId);
    if (!row) return undefined;

    return {
      client_id: row.client_id,
      // We don't return the raw secret — the SDK handles secret matching
      client_name: row.client_name ?? undefined,
      redirect_uris: row.redirect_uris,
      grant_types: row.grant_types,
      response_types: row.response_types,
      scope: row.scope ?? undefined,
      token_endpoint_auth_method: row.token_endpoint_auth_method ?? undefined,
      client_id_issued_at: row.client_id_issued_at,
      client_secret_expires_at: row.client_secret_expires_at,
    };
  }

  /**
   * Register a new OAuth client.
   * Called by the MCP SDK's /register endpoint.
   * The SDK may or may not include client_id depending on configuration.
   */
  async registerClient(
    clientInfo: Omit<StoredClient, 'client_id' | 'client_id_issued_at'>,
  ): Promise<StoredClient> {
    const clientId = `memron_${nanoid(24)}`;
    const issuedAt = Math.floor(Date.now() / 1000);

    // Hash the secret if present (we store hash, not plaintext)
    const secretHash = clientInfo.client_secret
      ? createHash('sha256').update(clientInfo.client_secret).digest('hex')
      : undefined;

    await db.insertOAuthClient({
      clientId,
      clientSecretHash: secretHash,
      clientName: clientInfo.client_name,
      redirectUris: clientInfo.redirect_uris ?? [],
      grantTypes: clientInfo.grant_types,
      responseTypes: clientInfo.response_types,
      scope: clientInfo.scope,
      tokenEndpointAuthMethod: clientInfo.token_endpoint_auth_method,
      clientIdIssuedAt: issuedAt,
      clientSecretExpiresAt: clientInfo.client_secret_expires_at,
    });

    return {
      ...clientInfo,
      client_id: clientId,
      client_id_issued_at: issuedAt,
    };
  }
}
