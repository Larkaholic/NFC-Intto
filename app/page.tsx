import Clock from './components/Clock';
import WeatherWidget from './components/WeatherWidget';

export const dynamic = 'force-dynamic';

function NFCWaveIcon() {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="44" r="5" fill="#888" />
      <path d="M28 24 C44 32 44 56 28 64" stroke="#888" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      <path d="M41 17 C62 28 62 60 41 71" stroke="#888" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      <path d="M55 11 C80 24 80 64 55 77" stroke="#888" strokeWidth="5.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function CheckInIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="9" r="4.5" stroke="#FFFEF9" strokeWidth="2" fill="none" opacity="0.8" />
      <path d="M4 23c0-4.418 3.582-8 8-8" stroke="#FFFEF9" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d="M20 16 L24 20 L20 24" stroke="#FFFEF9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.8" />
      <path d="M14 20 L24 20" stroke="#FFFEF9" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" />
    </svg>
  );
}

function CheckOutIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="9" r="4.5" stroke="#FFFEF9" strokeWidth="2" fill="none" opacity="0.8" />
      <path d="M4 23c0-4.418 3.582-8 8-8" stroke="#FFFEF9" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d="M24 16 L20 20 L24 24" stroke="#FFFEF9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.8" />
      <path d="M14 20 L24 20" stroke="#FFFEF9" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" />
    </svg>
  );
}

function InstitutionLogo() {
  return (
    <div
      className="w-14 h-14 rounded-full flex items-center justify-center text-cream/70 text-xs font-light tracking-wide"
      style={{ border: '1.5px solid rgba(255,254,249,0.3)' }}
    >
      {/* Replace with <Image src="/seal.png" alt="Seal" width={56} height={56} /> */}
      <span className="text-center leading-tight text-cream/60 text-[9px]">INSTITUTION<br />SEAL</span>
    </div>
  );
}

function BrandLogo() {
  return (
    <div className="flex flex-col items-center leading-none select-none">
      <div className="flex gap-0.75 mb-0.75">
        {['·', '·', '·', '·'].map((d, i) => (
          <span key={i} className="text-cream/60 text-xs">{d}</span>
        ))}
      </div>
      <span className="text-cream text-3xl tracking-widest font-black">
        InTTO
      </span>
    </div>
  );
}

function Inv8Logo() {
  return (
    <div className="flex items-center gap-2 text-cream/70">
      <span className="text-lg font-light tracking-wide">Inv8 Studio</span>
      <svg width="24" height="18" viewBox="0 0 24 18" fill="none" xmlns="http://www.w3.org/2000/svg" opacity="0.7">
        <path
          d="M8 9C8 9 6 5 3 5C1 5 0 7 0 9C0 11 1 13 3 13C6 13 8 9 8 9ZM8 9C8 9 10 13 13 13C15 13 16 11 16 9C16 7 15 5 13 5C10 5 8 9 8 9Z"
          stroke="#FFFEF9"
          strokeWidth="1.5"
          strokeLinejoin="round"
          fill="none"
          transform="translate(4 0)"
        />
      </svg>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="w-screen h-screen bg-brand flex items-center justify-center p-6">
      <div className="grid grid-cols-2 gap-4 w-full h-full max-w-6xl">

        {/* ── Left: Info Card ── */}
        <div className="glass-card flex flex-col items-center justify-between p-8">
          <div className="flex items-center gap-4 w-full justify-center">
            <InstitutionLogo />
            <BrandLogo />
          </div>

          <Clock />

          <WeatherWidget />

          <div className="flex flex-col items-center gap-1 text-cream/50">
            <span className="text-sm font-light tracking-widest uppercase">Powered By</span>
            <Inv8Logo />
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-4 h-full">

          {/* Top-right: NFC Login */}
          <div className="glass-card flex-1 flex flex-col items-center justify-center gap-6 px-8">
            <h2 className="text-cream text-5xl font-extrabold tracking-tight">
              Tap To Login
            </h2>

            <div className="nfc-area w-full max-w-xs flex items-center justify-center py-10">
              <NFCWaveIcon />
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]" />
              <span className="text-cream/80 text-base font-light tracking-wide">Ready to Scan</span>
            </div>
          </div>

          {/* Bottom-right: Guest Management */}
          <div className="glass-card flex-1 flex flex-col justify-center px-8 py-6 gap-5">
            <h2 className="text-cream text-4xl font-bold text-center tracking-tight">
              Guest Management
            </h2>

            <button className="guest-btn flex items-center gap-4 px-5 py-4 w-full text-left">
              <div className="shrink-0 w-10 h-10 rounded-full border border-cream/20 flex items-center justify-center">
                <CheckInIcon />
              </div>
              <div>
                <p className="text-cream font-semibold text-lg leading-tight">Check-In Guest</p>
                <p className="text-cream/50 text-sm font-light mt-0.5">Record guest arrival and start visit tracking</p>
              </div>
            </button>

            <button className="guest-btn flex items-center gap-4 px-5 py-4 w-full text-left">
              <div className="shrink-0 w-10 h-10 rounded-full border border-cream/20 flex items-center justify-center">
                <CheckOutIcon />
              </div>
              <div>
                <p className="text-cream font-semibold text-lg leading-tight">Check-Out Guest</p>
                <p className="text-cream/50 text-sm font-light mt-0.5">Complete visit and record departure time</p>
              </div>
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}
