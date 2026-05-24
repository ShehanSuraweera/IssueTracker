import { NewnopLogo } from "@/components/ui/newnop-logo";

interface HomeHeroProps {
  firstName: string;
}

export function HomeHero({ firstName }: HomeHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-linear-to-br from-primary/12 to-transparent">
      <div
        className="absolute top-0 inset-x-0 h-0.75"
        style={{ backgroundColor: "var(--brand-green)" }}
      />
      <div className="relative flex items-center justify-between px-8 py-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="h-1 w-6 rounded-full"
              style={{ backgroundColor: "var(--brand-green)" }}
            />
            <span className="text-xs font-semibold tracking-widest uppercase text-primary">
              NewnopDesk
            </span>
          </div>
          <h1 className="text-2xl font-semibold">Hello, {firstName}!</h1>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-sm leading-relaxed">
            Get a little help monitoring your work with your personal home page.
          </p>
        </div>
        <div className="relative hidden sm:flex items-center justify-center shrink-0 ml-8">
          <div
            className="absolute rounded-full blur-2xl"
            style={{
              width: 90,
              height: 90,
              backgroundColor: "var(--brand-green)",
              opacity: 0.2,
            }}
          />
          <NewnopLogo
            width={100}
            height={87}
            className="relative select-none pointer-events-none"
          />
        </div>
      </div>
    </div>
  );
}
