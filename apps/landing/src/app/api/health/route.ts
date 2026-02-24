// Force Node.js runtime (pg requires native modules not available in Edge)
export const runtime = 'nodejs';

// Database health check endpoint
// Returns the status of both PostgreSQL and Firebase connections

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
            databases: {
                postgres: {
                    status: health.postgres.connected ? 'connected' : 'disconnected',
                    latency: health.postgres.latencyMs
                        ? `${health.postgres.latencyMs}ms`
                        : undefined,
                    role: 'primary',
                    error: health.postgres.error,
                },
                firebase: {
                    status: health.firebase.connected ? 'connected' : 'disconnected',
                    latency: health.firebase.latencyMs
                        ? `${health.firebase.latencyMs}ms`
                        : undefined,
                    role: 'backup',
                    error: health.firebase.error,
                },
            },
        });
    } catch (error: any) {
        return NextResponse.json(
            {
                status: 'error',
                message: error.message,
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}
