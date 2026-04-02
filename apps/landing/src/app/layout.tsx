import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { ConditionalLayout } from '@/components/conditional-layout';
import { CookieConsent } from '@/components/cookie-consent';
import { FirebaseAuthProvider } from '@/components/auth-provider';

export const metadata: Metadata = {
  title: 'Memron.ai',
  description: 'Sovereign, cross-platform memory transfer between AI agents. Hardware-backed zero-trust context infrastructure powered by MCP.',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Inter:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=Pixelify+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <FirebaseAuthProvider>
          <ConditionalLayout>{children}</ConditionalLayout>
          <CookieConsent />
        </FirebaseAuthProvider>
      </body>
    </html>
  );
}

