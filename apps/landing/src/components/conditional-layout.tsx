'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from './navbar';
import { DottedBackground } from './dotted-background';
import { CursorNodes } from './cursor-nodes';

const CLEAN_ROUTES = ['/login', '/sign-up', '/forgot-password', '/sso-callback', '/dashboard', '/onboarding', '/playground'];

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isCleanPage = CLEAN_ROUTES.some(route => pathname.startsWith(route));

    if (isCleanPage) {
        // Auth/dashboard pages: no navbar, no dotted background, no cursor nodes
        return <>{children}</>;
    }

    // All other pages: full landing experience
    return (
        <>
            <DottedBackground />
            <CursorNodes />
            <Navbar />
            <main className="relative z-10">{children}</main>
        </>
    );
}
