import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Lock, Clock, ScanEye, LineChart } from "lucide-react";

const TRUST_ROW = [
  { icon: Lock, label: "Client-side encryption" },
  { icon: ShieldCheck, label: "Patient-controlled sharing" },
  { icon: Clock, label: "Time-bound access" },
  { icon: ScanEye, label: "Local privacy scanning" },
  { icon: LineChart, label: "Vitals timeline" },
];

const STEPS = [
  "Add records.",
  "Remove what should not be shared.",
  "Encrypt locally.",
  "Share only what is needed.",
  "Access disappears when you revoke or the share expires.",
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="border-b bg-gradient-to-b from-secondary/40 to-background px-6 py-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">MediKey</h1>
        <p className="mt-3 text-xl font-medium text-primary">Your records. Your keys. Your control.</p>
        <p className="mx-auto mt-6 max-w-2xl text-muted-foreground">
          Aggregate, sanitize, encrypt, visualize and securely share your health records — without handing a
          centralized server your medical plaintext.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" nativeButton={false} render={<Link href="/auth/sign-up">Open My Vault</Link>} />
          <Button size="lg" variant="secondary" nativeButton={false} render={<Link href="/auth/sign-in">Sign in</Link>} />
        </div>
      </section>

      <section className="border-b px-6 py-12">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 sm:grid-cols-5">
          {TRUST_ROW.map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 text-center">
              <Icon className="h-6 w-6 text-primary" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-16">
        <h2 className="text-center text-2xl font-semibold">How it works</h2>
        <ol className="mx-auto mt-8 max-w-md space-y-4">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <span className="text-sm">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-auto border-t px-6 py-6 text-center text-xs text-muted-foreground">
        MediKey organizes and explains user-provided health information. It does not provide diagnosis, treatment,
        or emergency medical services.
      </footer>
    </div>
  );
}
