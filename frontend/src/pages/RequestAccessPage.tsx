import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  requestAccessSchema,
  type RequestAccessFormValues,
} from "@/lib/schemas";
import {
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowLeft,
  Check,
  X,
} from "lucide-react";
import { NewnopLogo } from "@/components/ui/newnop-logo";
import { requestAccess } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const G = "#8cff2e";

export default function RequestAccessPage() {
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RequestAccessFormValues>({
    resolver: zodResolver(requestAccessSchema),
  });

  const passwordValue = watch("password", "");
  const hasInput = passwordValue.length > 0;

  const rules = [
    { label: "At least 8 characters", met: passwordValue.length >= 8 },
    { label: "One uppercase letter (A–Z)", met: /[A-Z]/.test(passwordValue) },
    { label: "One number (0–9)", met: /[0-9]/.test(passwordValue) },
  ];
  const strength = rules.filter((r) => r.met).length;
  const strengthLabel =
    strength === 0
      ? ""
      : strength === 1
        ? "Weak"
        : strength === 2
          ? "Fair"
          : "Strong";
  const strengthColor =
    strength === 1 ? "#ef4444" : strength === 2 ? "#f97316" : "#22c55e";

  async function onSubmit(values: RequestAccessFormValues) {
    setError(null);
    try {
      await requestAccess({
        fullName: values.fullName,
        email: values.email,
        companyName: values.companyName,
        password: values.password,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ??
        "Something went wrong. Please try again.";
      setError(msg);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[48%] flex-col justify-between p-14 relative overflow-hidden select-none"
        style={{ backgroundColor: "#111111" }}
      >
        {/* noise overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
            backgroundSize: "128px 128px",
          }}
        />
        <div
          className="absolute -top-32 -right-32 w-105 h-105 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${G}22 0%, transparent 70%)`,
          }}
        />
        <div
          className="absolute -bottom-40 -left-20 w-90 h-90 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${G}18 0%, transparent 70%)`,
          }}
        />

        {/* wordmark */}
        <div className="relative z-10 flex items-center gap-3">
          <NewnopLogo width={34} height={30} />
          <span className="text-white font-semibold text-lg tracking-tight">
            Newnop
          </span>
        </div>

        {/* center */}
        <div className="relative z-10 space-y-8">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-widest uppercase"
            style={{
              backgroundColor: `${G}18`,
              color: G,
              border: `1px solid ${G}30`,
            }}
          >
            <span
              className="size-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: G }}
            />
            Request Access
          </div>

          <div className="space-y-4">
            <h1 className="text-5xl font-bold leading-tight tracking-tight text-white">
              Join the
              <br />
              <span style={{ color: G }}>portal.</span>
            </h1>
            <p
              className="text-base leading-relaxed max-w-xs"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              Submit your details and a Newnop admin will review and activate
              your account within one business day.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {[
              "Your request is reviewed by a Newnop admin",
              "You'll receive an email once your account is activated",
              "Then sign in and start tracking your issues",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: `${G}20`,
                    color: G,
                    border: `1px solid ${G}40`,
                  }}
                >
                  {i + 1}
                </span>
                <span
                  className="text-sm"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* bottom */}
        <div className="relative z-10 space-y-4">
          <div
            className="h-px"
            style={{
              background: `linear-gradient(to right, ${G}60, transparent)`,
            }}
          />
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            ISO 9001-certified · CMMI-driven engineering · newnop.com
          </p>
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col bg-background">
        {/* top bar */}
        <div className="flex items-center justify-between px-10 py-5 border-b">
          <div className="flex items-center gap-2 lg:hidden">
            <NewnopLogo width={24} height={21} />
            <span className="font-semibold text-sm">NewnopDesk</span>
          </div>
          <span className="hidden lg:block text-sm font-semibold">
            NewnopDesk
          </span>
          <Link
            to="/login"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back to sign in
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-8 py-12">
          <div className="w-full max-w-md">
            {submitted ? (
              /* ── Success state ── */
              <div className="text-center space-y-5">
                <div
                  className="mx-auto flex size-16 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: `${G}18`,
                    border: `1px solid ${G}40`,
                  }}
                >
                  <CheckCircle2 className="size-8" style={{ color: G }} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight">
                    Request submitted!
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    A Newnop admin will review your request and activate your
                    account. Check your email for a confirmation.
                  </p>
                </div>
                <Link to="/login">
                  <Button variant="outline" className="mt-2">
                    Back to sign in
                  </Button>
                </Link>
              </div>
            ) : (
              /* ── Form ── */
              <div className="space-y-8">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold tracking-tight">
                    Request access
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Fill in your details — a Newnop admin will review and
                    activate your account.
                  </p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName">Full name</Label>
                      <Input
                        id="fullName"
                        placeholder="Jane Smith"
                        autoComplete="name"
                        autoFocus
                        className="h-11"
                        {...register("fullName")}
                      />
                      {errors.fullName && (
                        <p className="text-xs text-destructive">
                          {errors.fullName.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="companyName">Company</Label>
                      <Input
                        id="companyName"
                        placeholder="Acme Corp"
                        autoComplete="organization"
                        className="h-11"
                        {...register("companyName")}
                      />
                      {errors.companyName && (
                        <p className="text-xs text-destructive">
                          {errors.companyName.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email">Work email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      autoComplete="email"
                      className="h-11"
                      {...register("email")}
                    />
                    {errors.email && (
                      <p className="text-xs text-destructive">
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        className="pr-9 h-11"
                        {...register("password")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>

                    {/* Strength bar — only shown once user starts typing */}
                    {hasInput && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-1 gap-1">
                            {[1, 2, 3].map((i) => (
                              <div
                                key={i}
                                className="h-1 flex-1 rounded-full transition-all duration-300"
                                style={{
                                  backgroundColor:
                                    i <= strength
                                      ? strengthColor
                                      : "var(--border)",
                                }}
                              />
                            ))}
                          </div>
                          <span
                            className="text-xs font-medium w-10 text-right transition-colors"
                            style={{
                              color:
                                strength > 0 ? strengthColor : "transparent",
                            }}
                          >
                            {strengthLabel}
                          </span>
                        </div>

                        {/* Requirements checklist */}
                        <ul className="space-y-1">
                          {rules.map(({ label, met }) => (
                            <li key={label} className="flex items-center gap-2">
                              <span
                                className="flex size-4 shrink-0 items-center justify-center rounded-full transition-colors"
                                style={{
                                  backgroundColor: met
                                    ? "#22c55e18"
                                    : "var(--muted)",
                                  border: `1px solid ${met ? "#22c55e40" : "transparent"}`,
                                }}
                              >
                                {met ? (
                                  <Check
                                    className="size-2.5"
                                    style={{ color: "#22c55e" }}
                                  />
                                ) : (
                                  <X className="size-2.5 text-muted-foreground" />
                                )}
                              </span>
                              <span
                                className="text-xs transition-colors"
                                style={{
                                  color: met
                                    ? "#22c55e"
                                    : "var(--muted-foreground)",
                                }}
                              >
                                {label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword">Confirm password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirm ? "text" : "password"}
                        autoComplete="new-password"
                        className="pr-9 h-11"
                        {...register("confirmPassword")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={
                          showConfirm ? "Hide password" : "Show password"
                        }
                      >
                        {showConfirm ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-xs text-destructive">
                        {errors.confirmPassword.message}
                      </p>
                    )}
                  </div>

                  {error && (
                    <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive border border-destructive/20">
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 font-semibold"
                    disabled={isSubmitting}
                  >
                    {isSubmitting && (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    )}
                    Submit request
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* bottom bar */}
        <div className="border-t px-10 py-5">
          <p className="text-xs text-center text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-foreground underline underline-offset-4 hover:opacity-70 transition-opacity"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
