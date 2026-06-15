'use client';

import { useState, useEffect } from 'react';
import { checkInGuest, getEventsByStatus } from '@/lib/firestore';
import type { Event } from '@/lib/firestore';

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckInIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="12" cy="9" r="4.5" stroke="#FFFEF9" strokeWidth="2" fill="none" opacity="0.8" />
      <path d="M4 23c0-4.418 3.582-8 8-8" stroke="#FFFEF9" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d="M20 16 L24 20 L20 24" stroke="#FFFEF9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.8" />
      <path d="M14 20 L24 20" stroke="#FFFEF9" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" />
    </svg>
  );
}

function CheckOutIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="12" cy="9" r="4.5" stroke="#FFFEF9" strokeWidth="2" fill="none" opacity="0.8" />
      <path d="M4 23c0-4.418 3.582-8 8-8" stroke="#FFFEF9" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d="M24 16 L20 20 L24 24" stroke="#FFFEF9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.8" />
      <path d="M14 20 L24 20" stroke="#FFFEF9" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" />
    </svg>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({ label, required, children }: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-cream/60 text-xs font-medium tracking-widest uppercase">
        {label}{required && <span className="text-emerald-400 ml-0.5">*</span>}
      </span>
      <div className="[&_input]:w-full [&_input]:bg-transparent [&_input]:border [&_input]:border-white/15 [&_input]:rounded-lg [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-cream [&_input]:text-sm [&_input]:outline-none [&_input:focus]:border-emerald-400/60 [&_input::placeholder]:text-cream/25">
        {children}
      </div>
    </label>
  );
}

// ─── Check-In Modal ───────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', college: '', department: '', email: '', purpose: '' };

function CheckInModal({ onClose }: { onClose: () => void }) {
  const [form, setForm]         = useState(EMPTY_FORM);
  const [activeEvent, setActiveEvent] = useState<Event | null | undefined>(undefined);
  const [loading, setLoading]   = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(false);

  // Fetch active event once on mount
  useEffect(() => {
    getEventsByStatus('ongoing')
      .then((events) => setActiveEvent(events[0] ?? null))
      .catch(() => setActiveEvent(null))
      .finally(() => setFetching(false));
  }, []);

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError('');
    setLoading(true);
    try {
      await checkInGuest({
        name:          form.name.trim(),
        organization:  form.college.trim(),
        department:    form.department.trim() || undefined,
        email:         form.email.trim(),
        purpose:       activeEvent ? activeEvent.name : form.purpose.trim(),
        eventId:       activeEvent?.id ?? null,
        eventName:     activeEvent?.name ?? '',
        age:           0,
        gender:        'Prefer not to say',
        address:       '',
        contactNumber: '',
        handledBy:     'Kiosk',
      });
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onClose(); }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(13,41,31,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div
        className="glass-card w-full max-w-md p-8 flex flex-col gap-6 overflow-y-auto"
        style={{ maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-cream text-3xl font-bold tracking-tight">Guest Check-In</h2>
            {!fetching && activeEvent && (
              <p className="text-emerald-400 text-sm mt-1 flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                {activeEvent.name}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-cream/50 hover:text-cream text-2xl leading-none transition-colors disabled:opacity-30"
          >✕</button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <span className="text-emerald-400 text-5xl">✓</span>
            <p className="text-cream text-xl font-semibold">Checked in!</p>
          </div>
        ) : fetching ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-emerald-400 animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Full Name" required>
              <input
                type="text" required autoFocus
                placeholder="Juan Dela Cruz"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </Field>

            <Field label="College / Organization">
              <input
                type="text"
                placeholder="e.g. University of Cordilleras"
                value={form.college}
                onChange={(e) => set('college', e.target.value)}
              />
            </Field>

            <Field label="Department">
              <input
                type="text"
                placeholder="e.g. College of Information Technology"
                value={form.department}
                onChange={(e) => set('department', e.target.value)}
              />
            </Field>

            <Field label="Email">
              <input
                type="email"
                placeholder="juan@email.com"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </Field>

            {!activeEvent && (
              <Field label="Purpose" required>
                <input
                  type="text" required
                  placeholder="e.g. Meeting, Site Visit, Inquiry"
                  value={form.purpose}
                  onChange={(e) => set('purpose', e.target.value)}
                />
              </Field>
            )}

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button" onClick={onClose} disabled={loading}
                className="guest-btn flex-1 py-3 text-cream/70 font-medium text-base text-center disabled:opacity-50"
              >Cancel</button>
              <button
                type="submit" disabled={loading}
                className="flex-1 py-3 rounded-xl font-semibold text-base text-brand tracking-wide transition-opacity disabled:opacity-50"
                style={{ background: '#FFFEF9' }}
              >
                {loading ? 'Checking In…' : 'Check In'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Guest Management Card ────────────────────────────────────────────────────

export default function GuestManagementCard() {
  const [checkInOpen, setCheckInOpen] = useState(false);

  return (
    <>
      <div className="glass-card flex-1 flex flex-col justify-center px-8 py-8 gap-6">
        <h2 className="text-cream text-5xl font-extrabold text-center tracking-tight">
          Guest Management
        </h2>

        <button
          onClick={() => setCheckInOpen(true)}
          className="guest-btn flex items-center gap-4 px-6 py-5 w-full text-left"
        >
          <div className="shrink-0 w-11 h-11 rounded-full border border-cream/20 flex items-center justify-center">
            <CheckInIcon />
          </div>
          <div>
            <p className="text-cream font-semibold text-lg leading-tight">Check-In Guest</p>
            <p className="text-cream/50 text-sm font-light mt-0.5">Record guest arrival and start visit tracking</p>
          </div>
        </button>

        <button className="guest-btn flex items-center gap-4 px-6 py-5 w-full text-left">
          <div className="shrink-0 w-11 h-11 rounded-full border border-cream/20 flex items-center justify-center">
            <CheckOutIcon />
          </div>
          <div>
            <p className="text-cream font-semibold text-lg leading-tight">Check-Out Guest</p>
            <p className="text-cream/50 text-sm font-light mt-0.5">Complete visit and record departure time</p>
          </div>
        </button>
      </div>

      {checkInOpen && <CheckInModal onClose={() => setCheckInOpen(false)} />}
    </>
  );
}
