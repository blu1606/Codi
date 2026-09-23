"use client";

import { useEffect, useState } from "react";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import GitHubSignInButton from "./github-button";
import GoogleSignInButton from "./google-button";
import Loader from "./loader";

const REMEMBER_EMAIL_KEY = "codi_remember_email";

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const router = useRouter();
  const { isPending } = authClient.useSession();
  const [rememberMe, setRememberMe] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            try {
              if (rememberMe) {
                localStorage.setItem(REMEMBER_EMAIL_KEY, value.email);
              } else {
                localStorage.removeItem(REMEMBER_EMAIL_KEY);
              }
            } catch {
              // Ignore storage errors in restricted contexts
            }
            router.push("/dashboard");
            toast.success("Đăng nhập thành công!");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText || "Đăng nhập thất bại");
          },
        }
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
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">Chào mừng trở lại</CardTitle>
          <CardDescription>Đăng nhập vào tài khoản Codi của bạn</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <GoogleSignInButton text="Đăng nhập với Google" />
            <GitHubSignInButton text="Đăng nhập với GitHub" />
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Hoặc đăng nhập với Email</span>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="space-y-4"
          >
            <div>
              <form.Field name="email">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Email</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {field.state.meta.errors.map((error) => (
                      <p key={error?.message} className="text-xs text-destructive">
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
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Mật khẩu</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {field.state.meta.errors.map((error) => (
                      <p key={error?.message} className="text-xs text-destructive">
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </form.Field>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
                />
                <Label
                  htmlFor="remember-me"
                  className="text-xs font-normal text-muted-foreground cursor-pointer select-none"
                >
                  Ghi nhớ đăng nhập
                </Label>
              </div>
              <Link
                href={"/forgot-password" as any}
                className="text-xs text-primary hover:underline font-medium"
              >
                Quên mật khẩu?
              </Link>
            </div>

            <form.Subscribe
              selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? "Đang xử lý..." : "Đăng nhập"}
                </Button>
              )}
            </form.Subscribe>
          </form>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            <span>Chưa có tài khoản? </span>
            <Button
              variant="link"
              onClick={onSwitchToSignUp}
              className="p-0 text-xs text-primary font-semibold hover:underline"
            >
              Đăng ký ngay
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
