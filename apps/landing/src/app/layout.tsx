import type { Metadata } from 'next';
import '@/styles/globals.css';
import { Navbar } from '@/components/navbar';
import { DottedBackground } from '@/components/dotted-background';
import { CursorNodes } from '@/components/cursor-nodes';

export const metadata: Metadata = {
  title: 'Memron.ai',
  description: 'Sovereign, cross-platform memory transfer between AI agents. Hardware-backed zero-trust context infrastructure powered by MCP.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Pixelify+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <DottedBackground />
        <CursorNodes />
        <Navbar />
        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}
