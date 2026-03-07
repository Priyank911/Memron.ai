// Force Node.js runtime (pg requires native modules not available in Edge)
export const runtime = 'nodejs';

// Database health check endpoint
// Returns the status of both PostgreSQL and Firebase connections
// Both checks run concurrently with timeout protection

import { NextResponse } from 'next/server';
import { checkHealth } from '@/lib/db';

export async function GET() {
    try {
        const health = await checkHealth();

        const overallStatus =
            health.postgres.connected && health.firebase.connected
                ? 'healthy'
                : health.postgres.connected || health.firebase.connected
                    ? 'degraded'
                    : 'unhealthy';

        return NextResponse.json({
            status: overallStatus,
            timestamp: new Date().toISOString(),
            strategy: 'dual-write-failover',
            databases: {
                postgres: {
                    status: health.postgres.connected ? 'connected' : 'disconnected',
                    latency: health.postgres.latencyMs
                        ? `${health.postgres.latencyMs}ms`
                        : undefined,
                    role: 'primary (Aiven)',
                    error: health.postgres.error,
                },
                firebase: {
                    status: health.firebase.connected ? 'connected' : 'disconnected',
                    latency: health.firebase.latencyMs
                        ? `${health.firebase.latencyMs}ms`
                        : undefined,
                    role: 'backup (Firestore)',
                    error: health.firebase.error,
                },
            },
            features: {
                dualWrite: true,
                failoverReads: true,
                autoRepair: true,
                timeoutMs: 8000,
            },
        });
    } catch (error: any) {
        console.error('[Health API] Error:', error instanceof Error ? error.message : 'Unknown');
        return NextResponse.json(
            {
                status: 'error',
                message: 'Health check failed',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}
