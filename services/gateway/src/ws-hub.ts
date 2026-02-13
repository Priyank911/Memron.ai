/**
 * WebSocket Hub — Manages persistent WS connections for real-time
 * P2P drop notifications and tunnel sync events.
 */
export class WebSocketHub {
  private connections: Map<string, WebSocket> = new Map(); // DID → WebSocket

  /** Register a new WebSocket connection for a DID */
  register(did: string, ws: WebSocket): void {
    this.connections.set(did, ws);
  }

  /** Send a drop notification to a specific DID */
  notifyDrop(toDid: string, payload: any): void {
    const ws = this.connections.get(toDid);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'drop', payload }));
    }
  }

  /** Broadcast a tunnel sync event to all participants */
  broadcastSync(dids: string[], payload: any): void {
    for (const did of dids) {
      const ws = this.connections.get(did);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'sync', payload }));
      }
    }
  }

  /** Remove a disconnected DID */
  unregister(did: string): void {
    this.connections.delete(did);
  }
}
