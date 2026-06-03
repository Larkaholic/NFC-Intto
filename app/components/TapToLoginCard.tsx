'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import { createIntern, getInternByNfc, clockIn, clockOut } from '@/lib/firestore';
import { calcEndDate } from '@/lib/utils/dates';
import { ATTENDANCE } from '@/lib/attendance-config';

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

const MAJORS = (Object.entries(ATTENDANCE.baseHours) as [string, number][]).map(
  ([value, hours]) => ({ value, hours })
);

const EMPTY_FORM = {
  name: '',
  email: '',
  studentId: '',
  course: '',
  major: '',
  year: 1,
  school: '',
  supervisor: '',
  nfcUid: '',
  requiredHours: 0,
  startDate: '',
  endDate: '',
};

/** Auto-format input to 00-0000-000 */
function formatStudentId(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  let result = digits.slice(0, 2);
  if (digits.length > 2) result += '-' + digits.slice(2, 6);
  if (digits.length > 6) result += '-' + digits.slice(6, 9);
  return result;
}

type ScanState = 'idle' | 'processing' | 'success' | 'error';

export default function TapToLoginCard() {
  // ── Add Intern modal ──────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState(false);

  // ── NFC scan state ────────────────────────────────────────────────────────
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanResult, setScanResult] = useState<{
    name: string; action: 'in' | 'out'; time: string;
  } | null>(null);
  const [scanError, setScanError] = useState('');

  const bufferRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  const scanRef = useRef<ScanState>('idle');

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { scanRef.current = scanState; }, [scanState]);

  const processBuffer = useCallback(async () => {
    const uid = bufferRef.current.trim();
    bufferRef.current = '';
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    // Minimum UID length guard; skip if modal open or already processing
    if (uid.length < 4) return;
    if (openRef.current) return;
    if (scanRef.current !== 'idle') return;

    setScanState('processing');
    setScanResult(null);
    setScanError('');

    try {
      const intern = await getInternByNfc(uid);
      if (!intern) {
        setScanState('idle');
        setForm((f) => ({ ...f, nfcUid: uid }));
        setOpen(true);
        return;
      }

      const timeStr = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit',
      });

      if (intern.isClockedIn) {
        await clockOut(intern.id);
        setScanResult({ name: intern.name, action: 'out', time: timeStr });
      } else {
        await clockIn(intern.id);
        setScanResult({ name: intern.name, action: 'in', time: timeStr });
      }
      setScanState('success');
      setTimeout(() => { setScanState('idle'); setScanResult(null); }, 1000);
    } catch (err) {
      setScanState('error');
      setScanError(err instanceof Error ? err.message : 'Error processing card');
      setTimeout(() => setScanState('idle'), 1000);
    }
  }, []);

  // Global keydown listener — captures NFC reader HID keyboard output
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement
      ) return;

      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F2', 'F3',
        'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
      ].includes(e.key)) return;

      if (e.key === 'Enter') {
        processBuffer();
        return;
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(processBuffer, 150);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [processBuffer]);

  // ── Form helpers ──────────────────────────────────────────────────────────
  function set(field: keyof typeof EMPTY_FORM, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleMajorChange(value: string) {
    const major = MAJORS.find((m) => m.value === value);
    const hours = major?.hours ?? 0;
    setForm((f) => ({
      ...f,
      major: value,
      requiredHours: hours,
      endDate: calcEndDate(f.startDate, hours),
    }));
  }

  function handleStartDate(value: string) {
    setForm((f) => ({
      ...f,
      startDate: value,
      endDate: calcEndDate(value, f.requiredHours),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.endDate) {
      setFormError('Select a major and start date first.');
      return;
    }
    setFormError('');
    setLoading(true);
    try {
      const internId = await createIntern({
        name: form.name.trim(),
        email: form.email.trim(),
        studentId: form.studentId.trim(),
        course: form.course.trim(),
        major: form.major,
        year: Number(form.year),
        school: form.school.trim(),
        supervisor: form.supervisor.trim(),
        nfcUid: form.nfcUid.trim(),
        requiredHours: form.requiredHours,
        completedHours: 0,
        remainingHours: form.requiredHours,
        status: 'active',
        isClockedIn: false,
        lastClockIn: null,
        photoUrl: null,
        startDate: Timestamp.fromDate(new Date(form.startDate)),
        endDate: Timestamp.fromDate(new Date(form.endDate)),
      });

      // Auto clock-in at exactly 8:00 AM (no late penalty for registration day)
      const today8am = new Date();
      today8am.setHours(8, 0, 0, 0);
      await clockIn(internId, today8am);

      setFormSuccess(true);
      setForm(EMPTY_FORM);
      setTimeout(() => {
        setFormSuccess(false);
        setOpen(false);
      }, 1500);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to add intern.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (loading) return;
    setOpen(false);
    setFormError('');
    setForm(EMPTY_FORM);
  }

  return (
    <>
      {/* ── Card ── */}
      <div
        className="glass-card flex-1 flex flex-col items-center justify-center gap-6 px-8 select-none"
        onClick={() => { if (scanState === 'idle') setOpen(true); }}
        role="button"
        aria-label="Tap to log in or click to add intern"
        style={{ cursor: scanState === 'idle' ? 'pointer' : 'default' }}
      >
        {scanState === 'idle' && (
          <>
            <h2 className="text-cream text-5xl font-extrabold tracking-tight">Tap To Login</h2>
            <div className="nfc-area w-full max-w-xs flex items-center justify-center py-10">
              <NFCWaveIcon />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]" />
              <span className="text-cream/80 text-base font-light tracking-wide">Ready to Scan</span>
            </div>
          </>
        )}

        {scanState === 'processing' && (
          <div className="flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-full border-4 border-cream/20 border-t-emerald-400 animate-spin" />
            <span className="text-cream text-xl font-medium tracking-wide">Processing…</span>
          </div>
        )}

        {scanState === 'success' && scanResult && (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="text-emerald-400 text-7xl leading-none">✓</span>
            <p className="text-cream text-3xl font-bold">{scanResult.name}</p>
            <p className="text-emerald-400 text-lg font-semibold tracking-wide">
              {scanResult.action === 'in' ? 'Clocked In' : 'Clocked Out'}
            </p>
            <p className="text-cream/50 text-sm">{scanResult.time}</p>
          </div>
        )}

        {scanState === 'error' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="text-red-400 text-7xl leading-none">✕</span>
            <p className="text-cream text-xl font-semibold">{scanError}</p>
            <p className="text-cream/40 text-sm">Please try again</p>
          </div>
        )}
      </div>

      {/* ── Add Intern Modal ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(13,41,31,0.85)', backdropFilter: 'blur(6px)' }}
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div
            className="glass-card w-full max-w-2xl p-8 flex flex-col gap-6 overflow-y-auto"
            style={{ maxHeight: '90vh' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-cream text-3xl font-bold tracking-tight">Add Intern</h2>
              <button
                onClick={handleClose}
                className="text-cream/50 hover:text-cream text-2xl leading-none transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {formSuccess ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <span className="text-emerald-400 text-5xl">✓</span>
                <p className="text-cream text-xl font-semibold">Intern added successfully!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Full Name" required>
                    <input
                      type="text" required value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                      placeholder="Juan Dela Cruz"
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      type="email" value={form.email}
                      onChange={(e) => set('email', e.target.value)}
                      placeholder="juan@email.com"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Student ID" required>
                    <input
                      type="text" required value={form.studentId}
                      onChange={(e) => set('studentId', formatStudentId(e.target.value))}
                      placeholder="00-0000-000"
                      maxLength={11}
                    />
                  </Field>
                  <Field label="School / University" required>
                    <input
                      type="text" required value={form.school}
                      onChange={(e) => set('school', e.target.value)}
                      placeholder="University of Cordilleras"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <Field label="Course" required>
                    <input
                      type="text" required value={form.course}
                      onChange={(e) => set('course', e.target.value)}
                      placeholder="BSIT"
                    />
                  </Field>
                  <Field label="Major" required>
                    <select
                      required value={form.major}
                      onChange={(e) => handleMajorChange(e.target.value)}
                    >
                      <option value="" disabled>Select…</option>
                      {MAJORS.map((m) => (
                        <option key={m.value} value={m.value}>{m.value} — {m.hours}h</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Year Level">
                    <select value={form.year} onChange={(e) => set('year', Number(e.target.value))}>
                      {[1, 2, 3].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Supervisor">
                    <input
                      type="text" value={form.supervisor}
                      onChange={(e) => set('supervisor', e.target.value)}
                      placeholder="Supervisor name"
                    />
                  </Field>
                  <Field label="NFC Card UID" required>
                    <input
                      type="text" required value={form.nfcUid}
                      onChange={(e) => set('nfcUid', e.target.value)}
                      placeholder="e.g. A1B2C3D4"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <Field label="Required Hours">
                    <input
                      type="number" value={form.requiredHours || ''} disabled
                      placeholder="Auto from major"
                    />
                  </Field>
                  <Field label="Start Date" required>
                    <input
                      type="date" required value={form.startDate}
                      onChange={(e) => handleStartDate(e.target.value)}
                    />
                  </Field>
                  <Field label="End Date (approx.)">
                    <input
                      type="date" value={form.endDate} disabled
                      placeholder="Auto-calculated"
                    />
                  </Field>
                </div>

                {formError && (
                  <p className="text-red-400 text-sm text-center">{formError}</p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button" onClick={handleClose}
                    className="guest-btn flex-1 py-3 text-cream/70 font-medium text-base text-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit" disabled={loading}
                    className="flex-1 py-3 rounded-xl font-semibold text-base text-brand tracking-wide transition-opacity disabled:opacity-50"
                    style={{ background: '#FFFEF9' }}
                  >
                    {loading ? 'Saving…' : 'Add Intern'}
                  </button>
                </div>

              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label, required, children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-cream/60 text-xs font-medium tracking-widest uppercase">
        {label}{required && <span className="text-emerald-400 ml-0.5">*</span>}
      </span>
      <div className="[&_input]:w-full [&_select]:w-full [&_input]:bg-transparent [&_select]:bg-brand [&_input]:border [&_select]:border [&_input]:border-white/15 [&_select]:border-white/15 [&_input]:rounded-lg [&_select]:rounded-lg [&_input]:px-3 [&_select]:px-3 [&_input]:py-2.5 [&_select]:py-2.5 [&_input]:text-cream [&_select]:text-cream [&_input]:text-sm [&_select]:text-sm [&_input]:outline-none [&_select]:outline-none [&_input:focus]:border-emerald-400/60 [&_select:focus]:border-emerald-400/60 [&_input::placeholder]:text-cream/25 [&_input:disabled]:opacity-50 [&_input:disabled]:cursor-not-allowed">
        {children}
      </div>
    </label>
  );
}
