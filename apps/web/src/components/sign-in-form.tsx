"use client";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@codi-1/ui/components/alert";
import { Button } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { Checkbox } from "@codi-1/ui/components/checkbox";
import { Input } from "@codi-1/ui/components/input";
import { Label } from "@codi-1/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-redirect";
import { mapSignInError } from "@/lib/sign-in-error";
import GitHubSignInButton from "./github-button";
import GoogleSignInButton from "./google-button";
import Loader from "./loader";

const REMEMBER_EMAIL_KEY = "codi_remember_email";

export default function SignInForm({
  onSwitchToSignUp,
  onSuccess,
  returnTo = "/dashboard",
  courseTitle,
  intentReason,
}: {
  onSwitchToSignUp: () => void;
  onSuccess?: () => void;
  returnTo?: string;
  courseTitle?: string;
  intentReason?: string;
}) {
  const router = useRouter();
  const { isPending } = authClient.useSession();
  const [rememberMe, setRememberMe] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            setServerError(null);
            try {
              if (rememberMe) {
                localStorage.setItem(REMEMBER_EMAIL_KEY, value.email);
              } else {
                localStorage.removeItem(REMEMBER_EMAIL_KEY);
              }
            } catch {
              // Ignore storage errors in restricted contexts
            }
            try {
              authClient.$store.notify("$sessionSignal");
            } catch {
              // Ignore
            }
            toast.success("Đăng nhập thành công!");
            if (onSuccess) {
              onSuccess();
            } else {
              const safeDestination = safeNext(returnTo, "/dashboard");
              router.push(safeDestination as Route);
            }
          },
          onError: (error) => {
            const errorMessage = mapSignInError(error);
            setServerError(errorMessage);
            toast.error(errorMessage);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Địa chỉ email không hợp lệ"),
        password: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
      }),
    },
  });

  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (savedEmail) {
        form.setFieldValue("email", savedEmail);
        setRememberMe(true);
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, [form]);

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="w-full">
      <Card>
        <CardHeader className="text-center pb-3 pt-5 px-5 space-y-2">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Chào mừng trở lại!
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Đăng nhập để tiếp tục học tập và thanh toán
          </CardDescription>
          {courseTitle && (
            <div className="mt-1 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-left text-xs text-foreground">
              <span className="text-muted-foreground block text-[10px] mb-0.5">
                Khoá học đang chọn
              </span>
              <strong className="text-xs font-semibold text-foreground line-clamp-1">
                {courseTitle}
              </strong>
              {intentReason && (
                <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
                  {intentReason}
                </p>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4 px-5 pb-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="space-y-3"
          >
            {serverError && (
              <Alert variant="destructive" className="py-2.5 px-3 text-xs">
                {serverError}
              </Alert>
            )}

            <div>
              <form.Field name="email">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={field.name}
                      className="text-xs text-muted-foreground font-medium"
                    >
                      Địa chỉ Email
                    </Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      autoComplete="email"
                      placeholder="student@university.edu"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="bg-background/50 h-10"
                    />
                    {field.state.meta.errors.map((error) => (
                      <p
                        key={error?.message}
                        className="text-xs text-destructive"
                      >
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </form.Field>
            </div>

            <div>
              <form.Field name="password">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={field.name}
                      className="text-xs text-muted-foreground font-medium"
                    >
                      Mật khẩu
                    </Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="bg-background/50 h-10"
                    />
                    {field.state.meta.errors.map((error) => (
                      <p
                        key={error?.message}
                        className="text-xs text-destructive"
                      >
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </form.Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-email"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <Label
                  htmlFor="remember-email"
                  className="cursor-pointer text-xs text-muted-foreground"
                >
                  Ghi nhớ email
                </Label>
              </div>
              <button
                type="button"
                onClick={() => router.push("/forgot-password")}
                className="font-medium text-primary hover:underline cursor-pointer"
              >
                Quên mật khẩu?
              </button>
            </div>

            <div className="pt-1">
              <form.Subscribe
                selector={(state) => ({
                  canSubmit: state.canSubmit,
                  isSubmitting: state.isSubmitting,
                })}
              >
                {({ canSubmit, isSubmitting }) => (
                  <Button
                    type="submit"
                    className="w-full h-10 text-sm font-semibold bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 cursor-pointer"
                    disabled={!canSubmit || isSubmitting}
                  >
                    {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </form>

          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase">
              <span className="bg-card px-2.5 text-muted-foreground">Hoặc tiếp tục với</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <GoogleSignInButton text="Tiếp tục với Google" callbackURL={returnTo} />
            <GitHubSignInButton text="Tiếp tục với GitHub" callbackURL={returnTo} />
          </div>

          <div className="pt-2 text-center text-xs text-muted-foreground">
            <span>Chưa có tài khoản? </span>
            <button
              type="button"
              onClick={onSwitchToSignUp}
              className="text-primary font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer"
            >
              Đăng ký ngay
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
