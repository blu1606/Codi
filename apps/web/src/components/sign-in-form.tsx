"use client";
import { Eye, EyeOff } from 'lucide-react';
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
      <Card className="border-primary/15 bg-card text-card-foreground shadow-xl shadow-primary/10 dark:border-primary/25 dark:shadow-primary/20">
        <CardHeader className="text-center pb-6 pt-8 space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-2">
            <Eye
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6 text-primary"
            >
              <path d="M21.42 10.922a2 2 0 0 1-.019 3.837l-8.5 4.35a2 2 0 0 1-1.802 0l-8.5-4.35a2 2 0 0 1-.019-3.837l8.5-4.2a2 2 0 0 1 1.84 0l8.5 4.2Z" />
              <path d="M22 10v6" />
              <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
            </Eye>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Welcome Back, Student!</CardTitle>
          <CardDescription className="text-sm">Login to access your learning portal</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pb-8">
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
                    <Label htmlFor={field.name} className="text-xs text-muted-foreground font-medium">Email Address</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      autoComplete="email"
                      placeholder="student@university.edu"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="bg-background/50 h-11"
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
                    <Label htmlFor={field.name} className="text-xs text-muted-foreground font-medium">Password</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="bg-background/50 h-11"
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

            <div className="flex items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-email"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <Label htmlFor="remember-email" className="cursor-pointer text-sm text-muted-foreground">
                  Ghi nhớ email
                </Label>
              </div>
              <Link href="/forgot-password" className="font-medium text-primary hover:underline">
                Quên mật khẩu?
              </Link>
            </div>

            <div className="pt-2">
              <form.Subscribe
                selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
              >
                {({ canSubmit, isSubmitting }) => (
                  <Button
                    type="submit"
                    className="w-full h-11 text-base font-semibold bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90"
                    disabled={!canSubmit || isSubmitting}
                  >
                    {isSubmitting ? "Logging in..." : "Log In"}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground">OR</span>
            </div>
          </div>

          <div className="space-y-3">
            <GoogleSignInButton text="Continue with Google" />
            <GitHubSignInButton text="Continue with GitHub" />
          </div>

          <div className="pt-4 text-center text-sm text-muted-foreground">
            <span>Don't have an account? </span>
            <button
              type="button"
              onClick={onSwitchToSignUp}
              className="text-primary font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer"
            >
              Register here
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
