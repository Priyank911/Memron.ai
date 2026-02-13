// ═══════════════════════════════════════════════════════════════════
// @memron/mcp-bridge — Universal MCP Bridge
// Provides mirrored tool wrappers that operate on pointers (not raw data)
// to achieve 89-95% token compression across the Memory Tunnel.
// ═══════════════════════════════════════════════════════════════════

export { MemronMCPServer } from './server';
export { MemronMCPClient } from './client';
export { PointerEngine } from './pointer-engine';
export { ToolMirror } from './tool-mirror';
export { ContextInjector } from './context-injector';
export { BucketRouter } from './bucket-router';
export * from './types';
