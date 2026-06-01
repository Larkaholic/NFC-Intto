'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminSignIn } from '@/lib/auth';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminSignIn(email.trim(), password);
      router.replace('/admin');
    } catch {
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen flex items-center justify-center">
      <div className="glass-card w-full max-w-sm p-8 flex flex-col gap-6">
        <div className="text-center flex flex-col gap-1">
          <p className="text-emerald-400 text-xs font-medium tracking-widest uppercase">InTTO</p>
          <h1 className="text-cream text-2xl font-bold tracking-tight">Admin Login</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-cream/50 text-xs font-medium tracking-widest uppercase">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="bg-transparent border border-white/15 rounded-lg px-3 py-2.5 text-cream text-sm outline-none focus:border-emerald-400/60 placeholder:text-cream/25"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-cream/50 text-xs font-medium tracking-widest uppercase">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-transparent border border-white/15 rounded-lg px-3 py-2.5 text-cream text-sm outline-none focus:border-emerald-400/60 placeholder:text-cream/25"
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="py-3 rounded-xl font-semibold text-base text-brand tracking-wide transition-opacity disabled:opacity-50 mt-2"
            style={{ background: '#FFFEF9' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
