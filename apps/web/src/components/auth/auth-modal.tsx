"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@codi-1/ui/components/dialog";
import SignInForm from "../sign-in-form";
import SignUpForm from "../sign-up-form";

export interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intentReason?: string;
  courseTitle?: string;
  onSuccess: () => void;
}

export default function AuthModal({
  open,
  onOpenChange,
  intentReason,
  courseTitle,
  onSuccess,
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="login-cyber-violet sm:max-w-[440px] p-0 border-0 bg-transparent shadow-none ring-0 overflow-visible"
        showCloseButton={true}
      >
        <DialogTitle className="sr-only">Đăng nhập tài khoản</DialogTitle>
        <DialogDescription className="sr-only">
          Đăng nhập hoặc đăng ký tài khoản Codi để tiếp tục
        </DialogDescription>
        <div className="relative w-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgb(99_102_241_/_0.22),_transparent_65%)] dark:bg-[radial-gradient(ellipse_at_top,_rgb(129_140_248_/_0.28),_transparent_65%)] pointer-events-none rounded-2xl" />
          <div className="relative z-10 w-full">
            {activeTab === "signin" ? (
              <SignInForm
                onSwitchToSignUp={() => setActiveTab("signup")}
                onSuccess={() => {
                  onSuccess();
                  onOpenChange(false);
                }}
                courseTitle={courseTitle}
                intentReason={intentReason}
              />
            ) : (
              <SignUpForm
                onSwitchToSignIn={() => setActiveTab("signin")}
                onSuccess={() => {
                  onSuccess();
                  onOpenChange(false);
                }}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
