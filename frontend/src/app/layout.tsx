import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/providers/theme-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { SocketProvider } from "@/providers/socket-provider";
import { Toaster } from "sonner";
import { ClerkProvider } from '@clerk/nextjs';
import { SyncStatusManager } from '@/components/sync-status-manager';

export const metadata: Metadata = {
  title: "DevSync — Real-Time Collaborative Developer Workspace",
  description: "A full SaaS platform for developers to collaborate on docs, manage projects with Kanban boards, track code snippets, and get AI-powered suggestions — all in real-time.",
  keywords: ["developer workspace", "collaboration", "kanban", "real-time", "docs", "AI"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "#6366f1",
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
              <Toaster
                position="bottom-right"
                toastOptions={{
                  style: {
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  },
                }}
              />
            </SocketProvider>
          </AuthProvider>
        </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
