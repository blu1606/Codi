"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { LogIn, UserPlus } from "lucide-react";

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
    <div className="mx-auto w-full max-w-md px-4 pt-10 pb-16">
      {/* Segmented Tab Navigation: Tab Login / Tab Đăng ký */}
      <div className="mb-4 grid w-full grid-cols-2 rounded-xl bg-muted/80 p-1 text-muted-foreground border border-border/50 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setActiveTab("signin")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === "signin"
              ? "bg-background text-foreground shadow-sm font-bold border border-border/40"
              : "hover:text-foreground text-muted-foreground"
          }`}
        >
          <LogIn className="h-4 w-4" />
          <span>Đăng nhập</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("signup")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 cursor-pointer ${
            activeTab === "signup"
              ? "bg-background text-foreground shadow-sm font-bold border border-border/40"
              : "hover:text-foreground text-muted-foreground"
          }`}
        >
          <UserPlus className="h-4 w-4" />
          <span>Đăng ký</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="w-full">
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
