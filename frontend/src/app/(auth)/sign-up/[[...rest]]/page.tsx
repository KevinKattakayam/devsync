"use client";

import { SignUp } from '@clerk/nextjs';

export default function SignUpAliasPage() {
  return (
    <div className="flex justify-center items-center w-full">
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
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
