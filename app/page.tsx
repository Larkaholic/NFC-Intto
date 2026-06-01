import Image from 'next/image';
import Clock from './components/Clock';
import WeatherWidget from './components/WeatherWidget';
import TapToLoginCard from './components/TapToLoginCard';
import UCLogo from './src/UClogo.png';
import InTTOLogo from './src/inttoLogo.png';
import Inv8GroupLogo from './src/Group.png';

export const dynamic = 'force-dynamic';


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
  return <Image src={UCLogo} alt="UC Logo" width={56} height={56} className="rounded-full" />;
}

function BrandLogo() {
  return <Image src={InTTOLogo} alt="InTTO Logo" height={56} width={120} className="object-contain" />;
}

function Inv8Logo() {
  return (
    <div className="flex items-center gap-2 text-cream/70">
      <span className="text-5xl font-light tracking-wide">Inv8 Studio</span>
      <Image src={Inv8GroupLogo} alt="Inv8 Studio Logo" height={50} width={50} className="object-contain" />
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

          <TapToLoginCard />

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
