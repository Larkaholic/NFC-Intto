import Image from 'next/image';
import Clock from './components/Clock';
import WeatherWidget from './components/WeatherWidget';
import TapToLoginCard from './components/TapToLoginCard';
import GuestManagementCard from './components/GuestManagementCard';
import UCLogo from './src/UClogo.png';
import InTTOLogo from './src/inttoLogo.png';
import Inv8GroupLogo from './src/Group.png';

export const dynamic = 'force-dynamic';



function InstitutionLogo() {
  return <Image src={UCLogo} alt="UC Logo" width={90} height={90} className="rounded-full" />;
}

function BrandLogo() {
  return <Image src={InTTOLogo} alt="InTTO Logo" width={180} height={80} style={{ height: 'auto' }} className="object-contain" />;
}

function Inv8Logo() {
  return (
    <div className="flex items-center gap-2 text-cream/70">
      <span className="text-5xl font-light tracking-wide">Inv8 Studio</span>
      <Image src={Inv8GroupLogo} alt="Inv8 Studio Logo" width={50} height={50} style={{ height: 'auto' }} className="object-contain" />
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="w-screen h-screen bg-brand flex items-center justify-center p-30">
      <div className="grid grid-cols-2 gap-4 w-full h-full max-w-6xl">

        {/* ── Left: Info Card ── */}
        <div className="glass-card flex flex-col items-center justify-between p-8">
          <div className="flex items-center gap-5 w-full justify-center">
            <InstitutionLogo />
            <BrandLogo />
          </div>

          <div className="flex flex-col items-center gap-8">
            <Clock />
            <WeatherWidget />
          </div>

          <div className="flex flex-col items-center gap-1 text-cream/50">
            <span className="text-sm font-light tracking-widest uppercase">Powered By</span>
            <Inv8Logo />
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-4 h-full">

          <TapToLoginCard />

          {/* Bottom-right: Guest Management */}
          <GuestManagementCard />

        </div>

      </div>
    </main>
  );
}
