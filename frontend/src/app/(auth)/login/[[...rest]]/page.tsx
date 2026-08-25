"use client";

import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
  const handleClearCookies = () => {
    window.location.href = "/api/auth/reset?redirect=/login";
  };

  return (
    <div className="flex flex-col justify-center items-center w-full min-h-[420px] space-y-4">
      <SignIn
        path="/login"
        routing="path"
        signUpUrl="/signup"
        fallbackRedirectUrl="/dashboard"
      />
      <button
        onClick={handleClearCookies}
        className="text-[11px] text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
      >
        Clear stale session & reset
      </button>
    </div>
  );
}
