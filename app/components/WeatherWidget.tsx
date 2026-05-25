'use client';

import { useState, useEffect } from 'react';

interface WttrResponse {
  current_condition: Array<{ temp_C: string; weatherCode: string }>;
}

function CloudIcon() {
  return (
    <svg width="60" height="44" viewBox="0 0 60 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M14 36a10 10 0 010-20c.34 0 .68.02 1.01.05A14 14 0 0140 8a14 14 0 0114 14 10 10 0 010 14H14z"
        stroke="#FFFEF9"
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
        opacity="0.85"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="26" cy="26" r="10" stroke="#FFFEF9" strokeWidth="2.5" fill="none" opacity="0.85" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="26" y1="4" x2="26" y2="10"
          stroke="#FFFEF9" strokeWidth="2.5" strokeLinecap="round" opacity="0.85"
          transform={`rotate(${deg} 26 26)`}
        />
      ))}
    </svg>
  );
}

function getIcon(code: number) {
  if (code === 113) return <SunIcon />;
  return <CloudIcon />;
}

export default function WeatherWidget() {
  const [weather, setWeather] = useState<{ temp: string; code: number } | null>(null);

  useEffect(() => {
    fetch('https://wttr.in/?format=j1')
      .then((r) => r.json())
      .then((d: WttrResponse) =>
        setWeather({
          temp: d.current_condition[0].temp_C,
          code: parseInt(d.current_condition[0].weatherCode),
        })
      )
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center gap-5 text-[#FFFEF9]">
      {getIcon(weather?.code ?? 0)}
      <span className="text-3xl font-light tracking-wide">
        {weather?.temp ?? '--'}&nbsp;°C
      </span>
    </div>
  );
}
