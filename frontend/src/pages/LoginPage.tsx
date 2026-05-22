import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Eye, EyeOff, ShieldCheck, Globe, Users } from "lucide-react";
import { NewnopLogo } from "@/components/ui/newnop-logo";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email:    z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

const G = "#8cff2e";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/issues";

  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "Invalid email or password";
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
        {/* glow blobs */}
        <div
          className="absolute -top-32 -right-32 w-105 h-105 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${G}22 0%, transparent 70%)` }}
        />
        <div
          className="absolute -bottom-40 -left-20 w-90 h-90 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${G}18 0%, transparent 70%)` }}
        />

        {/* top wordmark */}
        <div className="relative z-10 flex items-center gap-3">
          <NewnopLogo width={34} height={30} />
          <span className="text-white font-semibold text-lg tracking-tight">Newnop</span>
        </div>

        {/* center content */}
        <div className="relative z-10 space-y-10">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-widest uppercase"
            style={{ backgroundColor: `${G}18`, color: G, border: `1px solid ${G}30` }}
          >
            <span className="size-1.5 rounded-full animate-pulse" style={{ backgroundColor: G }} />
            Client Issue Portal
          </div>

          <div className="space-y-5">
            <h1 className="text-5xl font-bold leading-tight tracking-tight text-white">
              Impact driven<br />
              <span style={{ color: G }}>support,</span><br />
              delivered fast.
            </h1>
            <p className="text-base leading-relaxed max-w-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
              Submit issues, track every update, and collaborate with our team — all from one place.
            </p>
          </div>

          {/* stats */}
          <div className="grid grid-cols-3 gap-0 pt-2">
            {[
              { value: "100+", label: "Projects" },
              { value: "30+",  label: "Team members" },
              { value: "3",    label: "Countries" },
            ].map(({ value, label }, i) => (
              <div
                key={label}
                className={`py-4 ${i !== 0 ? "border-l pl-6" : ""}`}
                style={{ borderColor: "rgba(255,255,255,0.08)" }}
              >
                <p className="text-3xl font-bold text-white">{value}</p>
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* bottom strip */}
        <div className="relative z-10 space-y-4">
          <div className="h-px" style={{ background: `linear-gradient(to right, ${G}60, transparent)` }} />
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
          <span className="hidden lg:block text-sm font-semibold">NewnopDesk</span>
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-full border"
            style={{ color: "rgba(0,0,0,0.45)", borderColor: "rgba(0,0,0,0.1)" }}
          >
            Client Portal
          </span>
        </div>

        {/* form area — grows to fill space */}
        <div className="flex flex-1 items-center justify-center px-8 py-12">
          <div className="w-full max-w-md space-y-8">

            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">Sign in</h2>
              <p className="text-sm text-muted-foreground">
                Welcome back — enter your credentials to access the portal.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  autoFocus
                  className="h-11"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="pr-10 h-11"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive border border-destructive/20">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                Sign in to portal
              </Button>
            </form>

            <p className="text-xs text-center text-muted-foreground">
              Don't have an account?{" "}
              <a
                href="https://www.newnop.com"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline underline-offset-4 hover:opacity-70 transition-opacity"
              >
                Contact Newnop
              </a>
            </p>

          </div>
        </div>

        {/* bottom trust bar */}
        <div className="border-t px-10 py-5">
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" />
              ISO 9001-certified
            </span>
            <span className="flex items-center gap-1.5">
              <Globe className="size-3.5" />
              3 countries
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" />
              30+ professionals
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
