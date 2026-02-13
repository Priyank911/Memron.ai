/**
 * SessionManager — Manages Lit Protocol session signatures
 * for authenticated decryption requests.
 */
export class SessionManager {
  private sessions: Map<string, LitSession> = new Map();

  /** Create a new session for a wallet/DID */
  async createSession(
    did: string,
    authSig: any,
    expiresAt: string, // RFC3339
  ): Promise<LitSession> {
    const session: LitSession = {
      did,
      sessionSigs: {},
      createdAt: new Date().toISOString(),
      expiresAt,
      active: true,
    };

    // TODO: Get session signatures from Lit network
    this.sessions.set(did, session);
    return session;
  }

  /** Get active session for a DID */
  getSession(did: string): LitSession | undefined {
    const session = this.sessions.get(did);
    if (!session || !session.active) return undefined;
    if (new Date(session.expiresAt) < new Date()) {
      session.active = false;
      return undefined;
    }
    return session;
  }

  /** Revoke a session */
  revokeSession(did: string): void {
    const session = this.sessions.get(did);
    if (session) {
      session.active = false;
    }
  }
}

export interface LitSession {
  did: string;
  sessionSigs: Record<string, any>;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}
