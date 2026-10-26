"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { onboardingReturnPath } from "@/lib/onboarding-return";
import { safeNext } from "@/lib/safe-redirect";

function LoginContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    if (tabParam === "signup") {
      setActiveTab("signup");
    } else if (tabParam === "signin") {
      setActiveTab("signin");
    }
  }, [tabParam]);

  const rawReturn = searchParams.get("returnTo") || searchParams.get("callbackURL") || searchParams.get("next");
  const sanitizedReturnTo = safeNext(rawReturn, onboardingReturnPath(rawReturn));

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full items-center justify-center overflow-y-auto bg-background p-4 py-8 sm:p-8">
      <div className="w-full max-w-md">
        {activeTab === "signin" ? (
          <SignInForm onSwitchToSignUp={() => setActiveTab("signup")} returnTo={sanitizedReturnTo} />
        ) : (
          <SignUpForm onSwitchToSignIn={() => setActiveTab("signin")} returnTo={sanitizedReturnTo} />
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[400px] flex items-center justify-center text-sm text-muted-foreground">
          Đang tải biểu mẫu...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
