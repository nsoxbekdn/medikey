import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, FileCheck2, FileText, LockKeyhole, ShieldCheck, Share2, UserRound, UsersRound } from "lucide-react";

const TRUST_POINTS = [
  { icon: ShieldCheck, label: "Secure by design" },
  { icon: LockKeyhole, label: "Patient controlled" },
  { icon: UsersRound, label: "Built for real care" },
];

const TRUST_STRIP = [
  { icon: FileCheck2, title: "Processed locally", body: "Your records are reviewed and sensitive information is identified in your browser." },
  { icon: LockKeyhole, title: "Share selectively", body: "Choose specific records and health signals instead of your entire vault." },
  { icon: UserRound, title: "Access on your terms", body: "Set an expiry, use one-time access, or revoke future retrieval." },
];

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden bg-white text-[#0b1f3a]">
      <header className="mx-auto flex h-16 w-full max-w-[1360px] items-center justify-between px-6 lg:px-10">
        <MediKeyLogo />
        <nav className="hidden items-center gap-10 text-[14px] font-medium text-[#17365f] md:flex" aria-label="Landing navigation">
          <a href="#how-it-works" className="transition-colors hover:text-[#1260bd]">How it works</a>
          <a href="#security" className="transition-colors hover:text-[#1260bd]">Security</a>
          <a href="#patient-control" className="transition-colors hover:text-[#1260bd]">For Patients</a>
          <a href="#clinical-sharing" className="transition-colors hover:text-[#1260bd]">For Providers</a>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/auth/sign-up" className="hidden px-3 py-2 text-[14px] font-medium text-[#17365f] transition-colors hover:text-[#1260bd] sm:block">Create account</Link>
          <Link href="/auth/sign-in" className="inline-flex h-10 items-center rounded-[7px] bg-[#062b63] px-5 text-[14px] font-semibold text-white shadow-[0_6px_16px_rgba(6,43,99,0.16)] transition-colors hover:bg-[#0b3979]">Open my vault</Link>
        </div>
      </header>

      <main>
        <section className="relative bg-[linear-gradient(115deg,#ffffff_0%,#f8fbff_55%,#f4f9ff_100%)]">
          <div className="mx-auto grid w-full max-w-[1360px] items-center gap-10 px-6 pb-10 pt-10 lg:min-h-[455px] lg:grid-cols-[0.5fr_0.5fr] lg:gap-10 lg:px-10 xl:min-h-[565px] xl:grid-cols-[0.47fr_0.53fr] xl:gap-16 xl:pb-[68px] xl:pt-[52px]">
            <div className="relative z-10 max-w-[575px]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.19em] text-[#175ab0]">Private health records</p>
              <h1 className="mt-4 text-[43px] font-semibold leading-[1.06] tracking-[-0.04em] text-[#071a37] sm:text-[49px] lg:text-[46px] xl:text-[61px]">
                Your medical records.<br /><span className="text-[#1763c0]">Under your control.</span>
              </h1>
              <p className="mt-6 max-w-[550px] text-[16px] leading-[1.65] text-[#334966] sm:text-[17px]">MediKey lets you organize, sanitize, encrypt and selectively share your medical records — without storing readable medical files on the backend.</p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/auth/sign-in" className="inline-flex h-[48px] items-center gap-2 rounded-[7px] bg-[#062b63] px-6 text-[15px] font-semibold text-white shadow-[0_8px_22px_rgba(6,43,99,0.15)] transition-colors hover:bg-[#0b3979]">Open my vault <ArrowRight className="h-4 w-4" /></Link>
                <Link href="/auth/sign-up" className="inline-flex h-[48px] items-center rounded-[7px] border border-[#d6e2f0] bg-white/70 px-6 text-[15px] font-semibold text-[#0b3979] transition-colors hover:bg-white">Create account</Link>
              </div>
              <div id="security" className="mt-10 grid max-w-[570px] grid-cols-1 gap-4 text-[13px] text-[#2a4160] sm:grid-cols-3 sm:gap-5">
                {TRUST_POINTS.map(({ icon: Icon, label }) => <div key={label} className="flex items-center gap-2.5 whitespace-nowrap"><Icon className="h-5 w-5 text-[#0a3978]" strokeWidth={1.8} /><span>{label}</span></div>)}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[720px] lg:mx-0">
              <div className="absolute -inset-x-2 -inset-y-12 -z-0 mx-auto w-[64%] rotate-[8deg] rounded-[38%] bg-[#dfeffa] opacity-75" aria-hidden="true" />
              <div className="relative z-10 overflow-hidden rounded-[15px] border border-[#cfdaea] bg-white shadow-[0_22px_48px_rgba(34,74,124,0.17)]">
                <Image src="/landing/medikey-dashboard.webp" alt="The real MediKey dashboard with its sidebar, privacy protections, recent records, and vitals area" width={1433} height={1075} priority sizes="(max-width: 1023px) 100vw, 54vw" className="h-auto w-full" />
              </div>
              <div className="relative z-20 ml-auto mt-3 flex w-fit items-start gap-2 pr-5 text-[#31527d] sm:pr-8">
                <svg aria-hidden="true" viewBox="0 0 44 30" className="mt-1 h-7 w-10 overflow-visible fill-none stroke-current" strokeWidth="1.2"><path d="M38 24C17 25 10 17 11 5" /><path d="m6 10 5-5 5 5" /></svg>
                <p className="rotate-[-2deg] font-serif text-[13px] italic leading-5">Share with your doctor,<br />not your entire history.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[#e8eef5] bg-white px-6 py-4">
          <div className="mx-auto grid max-w-[1220px] gap-9 md:grid-cols-3 md:gap-0">
            {TRUST_STRIP.map(({ icon: Icon, title, body }, index) => (
              <article key={title} className={`px-4 text-center md:px-10 ${index > 0 ? "md:border-l md:border-[#dfe7f0]" : ""}`}>
                <Icon className="mx-auto h-9 w-9 text-[#073777]" strokeWidth={1.55} />
                <h2 className="mt-2.5 text-[17px] font-semibold tracking-[-0.015em] text-[#082656]">{title}</h2>
                <p className="mx-auto mt-2 max-w-[320px] text-[14px] leading-[1.5] text-[#334966]">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_70%,#f7fbff_100%)] px-6 py-[30px]">
          <div className="mx-auto max-w-[1270px]">
            <div className="text-center"><p className="text-[12px] font-semibold uppercase tracking-[0.19em] text-[#175ab0]">A simple, secure flow</p><h2 className="mt-1 text-[34px] font-semibold tracking-[-0.035em] text-[#071a37] sm:text-[38px]">How it works</h2></div>
            <ol className="mt-6 grid gap-10 lg:grid-cols-3 lg:gap-12">
              <WorkflowStep number="1" title="Add and review" description="Upload a medical record or vitals dataset. Privacy X-Ray identifies sensitive information locally." arrow><ReviewVisual /></WorkflowStep>
              <WorkflowStep number="2" title="Encrypt" description="Approved records are encrypted in the browser before remote storage." arrow><EncryptVisual /></WorkflowStep>
              <WorkflowStep number="3" title="Share only what is needed" description="Choose records or vitals, set an expiry, and send a secure link or QR."><ShareVisual /></WorkflowStep>
            </ol>
          </div>
        </section>

        <section id="patient-control" className="border-t border-[#e8eef5] bg-[#f3f8fe] px-6 py-6">
          <div className="mx-auto grid max-w-[1360px] items-center gap-10 lg:grid-cols-[0.48fr_0.52fr] lg:px-10">
            <div className="max-w-[570px]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.19em] text-[#175ab0]">Built around patient control</p>
              <h2 className="mt-3 text-[32px] font-semibold leading-[1.15] tracking-[-0.035em] text-[#071a37] sm:text-[38px] lg:text-[32px] xl:text-[38px]">Share health data with confidence</h2>
              <p className="mt-4 max-w-[560px] text-[16px] leading-[1.6] text-[#334966] lg:mt-3 lg:text-[15px] xl:mt-4 xl:text-[16px]">MediKey helps you keep your medical information private while making it easy to share the right information with the right people at the right time.</p>
              <Link href="/auth/sign-in" className="mt-6 inline-flex h-[47px] items-center gap-2 rounded-[7px] bg-[#062b63] px-6 text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(6,43,99,0.14)] transition-colors hover:bg-[#0b3979] lg:mt-5 lg:h-11 xl:mt-6 xl:h-[47px]">Open my vault <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div id="clinical-sharing" className="grid gap-4 sm:grid-cols-[1.45fr_0.95fr]">
              <div className="relative min-h-[220px] overflow-hidden rounded-[16px] bg-[#dfeaf5]"><Image src="/landing/clinician-tablet.webp" alt="A clinician using a tablet in a bright clinic" fill sizes="(max-width: 640px) 100vw, 34vw" className="object-cover" /></div>
              <aside className="flex min-h-[220px] flex-col justify-center rounded-[16px] border border-white/80 bg-white/70 px-5 py-5 shadow-[0_12px_34px_rgba(32,72,120,0.06)]"><Share2 className="h-6 w-6 text-[#1763c0]" strokeWidth={1.7} /><h3 className="mt-3 text-[17px] font-semibold leading-snug text-[#0b2852]">Patient-selected by design.</h3><p className="mt-3 text-[13px] leading-[1.5] text-[#3d5270]">Only chosen records and health signals are included in each secure share.</p></aside>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e8eef5] bg-white px-6 py-7">
        <div className="mx-auto flex max-w-[1360px] flex-col gap-7 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-7"><MediKeyLogo compact /><p className="text-[12px] text-[#445873]">Your records. Your keys. Your control.</p></div>
          <div className="flex flex-col gap-5 text-[12px] text-[#334966] sm:flex-row sm:items-start sm:gap-9"><nav className="flex gap-7" aria-label="Footer navigation"><a href="#security" className="hover:text-[#1763c0]">Security</a><a href="#patient-control" className="hover:text-[#1763c0]">Privacy</a><a href="https://github.com/nsoxbekdn/medikey" className="hover:text-[#1763c0]">GitHub</a></nav><p className="leading-[1.45]">Hackathon Prototype<br />Synthetic data recommended.</p></div>
        </div>
      </footer>
    </div>
  );
}

function MediKeyLogo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="flex items-center gap-2.5" aria-label="MediKey home"><span className="relative block h-7 w-7" aria-hidden="true"><span className="absolute left-0 top-[7px] h-3.5 w-3.5 rounded-[5px] bg-[#1559ad]" /><span className="absolute left-[7px] top-0 h-3.5 w-3.5 rounded-[5px] bg-[#0a438f]" /><span className="absolute bottom-0 left-[7px] h-3.5 w-3.5 rounded-[5px] bg-[#2b86c2]" /><span className="absolute right-0 top-[7px] h-3.5 w-3.5 rounded-[5px] bg-[#1f9e9b]" /></span><span className={`${compact ? "text-[16px]" : "text-[18px]"} font-semibold tracking-[-0.03em] text-[#071a37]`}>MediKey</span></Link>;
}

function WorkflowStep({ number, title, description, arrow = false, children }: { number: string; title: string; description: string; arrow?: boolean; children: React.ReactNode }) {
  return <li className="relative min-w-0"><div className="flex min-h-[75px] items-start gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#155aad] text-[16px] font-semibold text-white">{number}</span><div><h3 className="text-[17px] font-semibold text-[#0a2855]">{title}</h3><p className="mt-2 max-w-[320px] text-[14px] leading-[1.48] text-[#3c506c]">{description}</p></div></div>{arrow && <ArrowRight className="absolute -right-8 top-2 hidden h-6 w-6 text-[#8eb3df] lg:block" strokeWidth={1.4} />}<div className="mt-3 flex h-[185px] items-center justify-center">{children}</div></li>;
}

function ReviewVisual() {
  return <div className="relative h-[210px] w-full max-w-[330px]"><div className="absolute left-1 top-1 h-[165px] w-[215px] rounded-[11px] border border-[#d9e3ef] bg-white p-5 shadow-[0_12px_28px_rgba(36,73,115,0.08)]"><div className="flex items-center gap-2 text-[12px] font-semibold text-[#17365f]"><FileText className="h-4 w-4 text-[#1763c0]" /> Medical record</div><div className="mt-5 space-y-3">{["82%", "68%", "75%", "58%"].map((width) => <div key={width} className="flex items-center gap-3"><span className="h-1.5 w-14 rounded bg-[#dce5ef]" /><span className="h-2 rounded bg-[#9caabd]" style={{ width }} /></div>)}</div></div><div className="absolute bottom-0 right-0 w-[205px] rounded-[11px] border border-[#d9e3ef] bg-white px-5 py-4 shadow-[0_14px_32px_rgba(36,73,115,0.12)]"><div className="flex items-center gap-2 text-[13px] font-semibold text-[#17365f]"><ShieldCheck className="h-5 w-5 text-[#27a984]" /> Privacy X-Ray</div><div className="mt-3 space-y-2 text-[11px] text-[#455a74]"><CheckLine text="Sensitive data found" /><CheckLine text="Ready to sanitize" /></div></div></div>;
}

function EncryptVisual() {
  return <div className="relative h-[210px] w-full max-w-[250px]"><div className="absolute inset-x-8 top-2 h-[174px] rounded-[12px] border border-[#d9e3ef] bg-white shadow-[0_12px_28px_rgba(36,73,115,0.08)]"><div className="absolute right-0 top-0 h-12 w-12 rounded-bl-lg bg-[#edf5fc] [clip-path:polygon(0_0,100%_100%,100%_0)]" /><div className="ml-7 mt-8 h-2 w-16 rounded bg-[#d7e5f4]" /><div className="ml-7 mt-4 h-2 w-24 rounded bg-[#e8eef5]" /><div className="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-[14px] bg-[#e8f2fc] text-[#1763c0]"><LockKeyhole className="h-9 w-9" strokeWidth={1.8} /></div></div><div className="absolute bottom-0 left-1/2 flex w-[175px] -translate-x-1/2 items-center gap-2 rounded-[10px] border border-[#d9e3ef] bg-white px-4 py-3 shadow-[0_12px_28px_rgba(36,73,115,0.1)]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#def5ed] text-[#24a67e]"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span><span><span className="block text-[12px] font-semibold text-[#17365f]">Encrypted</span><span className="block text-[10px] text-[#64758a]">Stored securely</span></span></div></div>;
}

function ShareVisual() {
  return <div className="relative h-[220px] w-full max-w-[335px]"><div className="absolute left-0 top-1 w-[220px] rounded-[11px] border border-[#d9e3ef] bg-white p-4 shadow-[0_14px_32px_rgba(36,73,115,0.12)]"><div className="text-[12px] font-semibold text-[#17365f]">Selective share</div><div className="mt-4 space-y-2.5 text-[10px] text-[#3c506c]"><CheckLine text="Sanitized blood report" /><CheckLine text="One-time access" /></div><div className="mt-4 flex items-center justify-between rounded-md bg-[#f4f7fb] px-3 py-2 text-[10px] text-[#455a74]"><span>Access expires</span><span className="font-semibold text-[#17365f]">1 hour</span></div><div className="mt-3 rounded-md bg-[#0a3978] py-2 text-center text-[10px] font-semibold text-white">Create secure share</div></div><div className="absolute right-0 top-10 flex h-[135px] w-[118px] flex-col items-center justify-center rounded-[10px] border border-[#d9e3ef] bg-white shadow-[0_10px_26px_rgba(36,73,115,0.09)]"><QrMark /><span className="mt-2 text-[10px] text-[#425771]">Scan to access</span></div></div>;
}

function CheckLine({ text }: { text: string }) {
  return <div className="flex items-center gap-2"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#27a984] text-white"><Check className="h-2.5 w-2.5" strokeWidth={3} /></span><span>{text}</span></div>;
}

function QrMark() {
  return <svg viewBox="0 0 60 60" className="h-[62px] w-[62px] text-[#102a56]" aria-label="QR code illustration"><rect width="60" height="60" rx="4" fill="white" /><g fill="currentColor"><path d="M4 4h20v20H4zm5 5v10h10V9zM36 4h20v20H36zm5 5v10h10V9zM4 36h20v20H4zm5 5v10h10V41z" fillRule="evenodd" /><path d="M28 4h4v8h-4zm0 12h8v4h-8zm0 8h4v8h-4zm8 4h8v4h-8zm12 0h8v8h-4v4h-4zm-20 8h8v4h-4v8h-4zm12 0h4v4h4v4h-8zm12 8h4v12h-12v-4h8zm-20 8h8v4h-8z" /></g></svg>;
}
