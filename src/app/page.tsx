import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock3, FileSearch, LockKeyhole, Share2, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const TRUST_POINTS = [
  { icon: ShieldCheck, label: "Secure by design" },
  { icon: UserRoundCheck, label: "Patient controlled" },
  { icon: Clock3, label: "Time-bound access" },
];

const STEPS = [
  {
    number: "01",
    icon: FileSearch,
    title: "Add and review",
    description: "Upload a record or vitals dataset, then review sensitive information locally.",
  },
  {
    number: "02",
    icon: LockKeyhole,
    title: "Encrypt in your browser",
    description: "Approved records are encrypted before they are stored remotely.",
  },
  {
    number: "03",
    icon: Share2,
    title: "Share only what is needed",
    description: "Choose specific records or signals, set an expiry, and send a secure link.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-foreground">
      <header className="mx-auto flex h-20 w-full max-w-[1400px] items-center justify-between px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5" aria-label="MediKey home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">M</span>
          <span className="text-[17px] font-semibold tracking-tight text-primary">MediKey</span>
        </Link>
        <nav className="hidden items-center gap-9 text-sm text-muted-foreground md:flex" aria-label="Landing navigation">
          <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#security" className="transition-colors hover:text-foreground">Security</a>
        </nav>
        <div className="flex items-center gap-3">
          <Button variant="ghost" nativeButton={false} render={<Link href="/auth/sign-in">Sign in</Link>} />
          <Button nativeButton={false} render={<Link href="/auth/sign-up">Open my vault</Link>} className="hidden sm:inline-flex" />
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-[1400px] items-center gap-16 px-6 pb-28 pt-20 lg:grid-cols-[0.43fr_0.57fr] lg:gap-20 lg:px-10 lg:pb-36 lg:pt-28">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue">Private health records</p>
            <h1 className="mt-6 text-[44px] font-semibold leading-[1.08] tracking-[-0.035em] text-primary sm:text-[56px] lg:text-[62px]">
              Your medical records. <span className="text-blue">Under your control.</span>
            </h1>
            <p className="mt-8 max-w-lg text-[17px] leading-7 text-muted-foreground">
              Organize, sanitize, encrypt, and selectively share your health records—without storing readable medical files on the backend.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button size="lg" nativeButton={false} render={<Link href="/auth/sign-up">Open my vault <ArrowRight className="h-4 w-4" /></Link>} />
              <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/auth/sign-in">Sign in</Link>} />
            </div>
            <div id="security" className="mt-12 flex flex-wrap gap-x-7 gap-y-4">
              {TRUST_POINTS.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon className="h-[18px] w-[18px] text-primary" strokeWidth={1.75} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[820px] lg:mx-0">
            <div className="absolute -inset-8 -z-10 rotate-2 rounded-[30%] bg-blue-soft/80" aria-hidden="true" />
            <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_20px_60px_rgba(23,54,93,0.13)]">
              <Image
                src="/medikey-dashboard-real.webp"
                alt="The real MediKey dashboard showing privacy protections and recent encrypted records"
                width={1440}
                height={900}
                priority
                sizes="(max-width: 1024px) 100vw, 58vw"
                className="h-auto w-full"
              />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-y border-border-subtle bg-background/70 px-6 py-28 lg:py-36">
          <div className="mx-auto max-w-[1200px]">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue">A simple, secure flow</p>
              <h2 className="mt-5 text-[34px] font-semibold tracking-[-0.025em] text-primary sm:text-[40px]">How it works</h2>
            </div>
            <ol className="mt-20 grid gap-14 md:grid-cols-3 md:gap-12">
              {STEPS.map(({ number, icon: Icon, title, description }) => (
                <li key={number} className="border-t border-border pt-7">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold tracking-[0.12em] text-blue">{number}</span>
                    <Icon className="h-6 w-6 text-primary" strokeWidth={1.6} />
                  </div>
                  <h3 className="mt-8 text-xl font-semibold tracking-[-0.015em] text-primary">{title}</h3>
                  <p className="mt-4 max-w-sm text-[15px] leading-6 text-muted-foreground">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-6 py-28 text-center lg:py-36">
          <div className="mx-auto max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue">Built around patient control</p>
            <h2 className="mt-5 text-[34px] font-semibold tracking-[-0.025em] text-primary sm:text-[40px]">Share health data with confidence.</h2>
            <p className="mx-auto mt-6 max-w-xl text-[16px] leading-7 text-muted-foreground">Keep your medical information private while making the right information available to the right people at the right time.</p>
            <Button size="lg" nativeButton={false} render={<Link href="/auth/sign-up">Open my vault <ArrowRight className="h-4 w-4" /></Link>} className="mt-10" />
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle px-6 py-10">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-4">
          <div className="flex items-center gap-3"><span className="font-semibold text-primary">MediKey</span><span>Your records. Your keys. Your control.</span></div>
          <p>MediKey does not provide diagnosis, treatment, or emergency medical services.</p>
        </div>
      </footer>
    </div>
  );
}
