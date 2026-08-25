import { Zap } from "lucide-react";
import { AuthErrorBoundary } from "@/components/auth-error-boundary";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-card border-r border-border">
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md gradient-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold">DevSync</span>
          </div>

          <div>
            <blockquote className="text-lg font-medium leading-relaxed mb-4">
              &ldquo;We replaced Notion, Trello, and a shared Google Doc with one workspace. 
              Our standup prep went from 15 minutes to 2.&rdquo;
            </blockquote>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                AK
              </div>
              <div>
                <p className="text-sm font-medium">Alex Kim</p>
                <p className="text-xs text-muted-foreground">Engineering Lead, Acme Inc.</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} DevSync
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background relative overflow-hidden">
        <div className="absolute top-1/4 -right-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -left-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="w-full max-w-md animate-fade-in relative z-10 flex justify-center">
          <AuthErrorBoundary>
            {children}
          </AuthErrorBoundary>
        </div>
      </div>
    </div>
  );
}
