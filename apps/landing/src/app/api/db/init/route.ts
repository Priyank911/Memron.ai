// Force Node.js runtime (pg requires native modules not available in Edge)
export const runtime = 'nodejs';

// Database initialization endpoint
// Creates the users table and indexes in PostgreSQL
// Should be called once during initial setup

import { NextResponse } from 'next/server';
import { initializeSchema, testConnection } from '@/lib/postgres';

export async function POST() {
    try {
        // First test the connection
        const connected = await testConnection();
        if (!connected) {
            return NextResponse.json(
                { error: 'Cannot connect to PostgreSQL' },
                { status: 503 }
            );
        }

        // Initialize the schema
        await initializeSchema();

        return NextResponse.json({
            success: true,
            message: 'Database schema initialized successfully',
            tables: ['users'],
            indexes: ['idx_users_clerk_id', 'idx_users_email', 'idx_users_is_active'],
        });
    } catch (error: any) {
        console.error('[Init] Schema initialization failed:', error.message);
        return NextResponse.json(
            { error: 'Schema initialization failed', message: error.message },
            { status: 500 }
        );
    }
}
