import type { Metadata } from 'next';
import './globals.css';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { ThemeProvider } from '@/providers/theme-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { SocketProvider } from '@/providers/socket-provider';
import { Toast } from '@/components/ui/overlays';
import { ClerkProvider } from '@clerk/nextjs';
import { SyncStatusManager } from '@/components/sync-status-manager';

export const metadata: Metadata = {
  title: 'DevSync — Real-Time Collaborative Developer Workspace',
  description:
    'A full SaaS platform for developers to collaborate on docs, manage projects with Kanban boards, track code snippets, and get AI-powered suggestions — all in real-time.',
  keywords: ['developer workspace', 'collaboration', 'kanban', 'real-time', 'docs', 'AI'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen`}>
        {process.env.DEPLOYMENT_MODE === 'local' &&
        !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <main className="mx-auto max-w-2xl space-y-4 p-8">
            <h1 className="text-2xl font-semibold">DevSync local setup</h1>
            <p>
              The local services and sample data can start without identity keys. Protected
              workspace access requires your Clerk configuration.
            </p>
            <p>
              Set the Clerk keys and real seed user IDs described in DEPLOYMENT.md, then rebuild. No
              test login or authentication bypass is enabled.
            </p>
          </main>
        ) : (
          <ClerkProvider
            appearance={{
              variables: {
                colorPrimary: 'var(--primary)',
              },
            }}
          >
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
              disableTransitionOnChange
            >
              <AuthProvider>
                <SocketProvider>
                  {children}
                  <SyncStatusManager />
                  <Toast />
                </SocketProvider>
              </AuthProvider>
            </ThemeProvider>
          </ClerkProvider>
        )}
      </body>
    </html>
  );
}
