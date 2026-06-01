'use client';

import { useState, useEffect } from 'react';

export default function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Use setTimeout so the initial setState is in a callback, not synchronous in the effect body.
    const init = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => { clearTimeout(init); clearInterval(id); };
  }, []);

  if (!now) return <div className="h-40" />;

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const date = now.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col items-center select-none">
      <span
        className="leading-none text-cream font-black tracking-tight"
        style={{ fontSize: 'clamp(5rem, 12vw, 9rem)', letterSpacing: '-0.02em' }}
      >
        {hh}:{mm}
      </span>
      <span className="text-cream/80 text-2xl font-light tracking-widest mt-1">
        {date}
      </span>
    </div>
  );
}
