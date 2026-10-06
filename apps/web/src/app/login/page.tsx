"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

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

  return (
    <div className="login-cyber-violet relative flex min-h-[calc(100vh-4rem)] w-full items-center justify-center overflow-y-auto bg-background p-4 py-8 sm:p-8">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "url('https://cdn.21st.dev/assets/mirror/80/807b564e6a3dfa435b6ffb617953d522554723e27b78eaa0ae311392cb957016.jpg')",
        }}
      >
        <div className="absolute inset-0 bg-background/80 dark:bg-background/88 backdrop-blur-sm" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgb(99_102_241_/_0.18),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,_rgb(129_140_248_/_0.22),_transparent_55%)]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {activeTab === "signin" ? (
          <SignInForm onSwitchToSignUp={() => setActiveTab("signup")} />
        ) : (
          <SignUpForm onSwitchToSignIn={() => setActiveTab("signin")} />
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
