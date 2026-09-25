import './dashboard.css';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { unsealSession } from '@/lib/session';
import { getUserFromPostgres } from '@/lib/postgres';

export const runtime = 'nodejs';

/**
 * Server-side dashboard gate. The browser onboarding cookie is only a cache
 * hint; the sealed identity and primary database state decide access.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies();
    const session = unsealSession(cookieStore.get('__session')?.value);
    if (!session) redirect('/login');

    const dbUser = await getUserFromPostgres(session.sub);
    if (!dbUser || !dbUser.is_onboarded) redirect('/onboarding');

    return <>{children}</>;
}
