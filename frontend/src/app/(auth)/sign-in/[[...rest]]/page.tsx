"use client";

import { SignIn } from '@clerk/nextjs';

export default function SignInAliasPage() {
  return (
    <div className="flex justify-center items-center w-full">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
        appearance={{
          elements: {
            rootBox: "w-full shadow-2xl rounded-2xl",
            card: "bg-card border border-white/10 shadow-2xl rounded-2xl",
          },
        }}
      />
    </div>
  );
}
