'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { Timestamp } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { adminSignOut } from '@/lib/auth';
import { calcEndDate } from '@/lib/utils/dates';
import { ATTENDANCE } from '@/lib/attendance-config';
import {
  getAllInterns,
  getAllTimeRecords,
  getGuestsByDate,
  getTimeRecordsByDate,
  getAllInternAnalytics,
  getHoursByMajor,
  getInternsNearCompletion,
  getDailyAttendance,
  recalcAllInternHours,
  updateIntern,
  propagateInternNameUpdate,
  getStaffByNfc,
  clockIn,
  clockOut,
  updateTimeRecord,
  recalcAllInternEndDates,
  getClosedDays,
  addClosedDay,
  removeClosedDay,
  getAllEvents,
  createEvent,
  updateEvent,
} from '@/lib/firestore';
import type { Intern, Guest, TimeRecord, InternAnalyticsSummary, ClosedDay, Event, EventCreate } from '@/lib/firestore';

type Tab = 'interns' | 'guests' | 'records' | 'analytics' | 'closedDays';

type AuthAction =
  | { type: 'edit';              intern: Intern }
  | { type: 'clock-in';         intern: Intern }
  | { type: 'clock-out';        intern: Intern }
  | { type: 'edit-record';      record: TimeRecord; intern: Intern }
  | { type: 'add-closed-day';   date: string; reason: string }
  | { type: 'remove-closed-day'; id: string; date: string }
  | { type: 'create-event';     data: EventCreate }
  | { type: 'set-event-active'; id: string }
  | { type: 'end-event';        id: string };

const todayStr = new Date().toISOString().split('T')[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts: { toDate: () => Date } | null): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTimeRaw(ts: { toDate: () => Date } | null): string {
  if (!ts) return '';
  return ts.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function parseName(full: string): { first: string; last: string; mi: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '', mi: '' };
  if (parts.length === 2) return { first: parts[0], last: parts[1], mi: '' };
  return { first: parts[0], mi: parts[1][0] + '.', last: parts.slice(2).join(' ') };
}

async function exportInternRecordsXLS(interns: Intern[]) {
  const allRecords = await getAllTimeRecords();
  const internMap = new Map(interns.map((i) => [i.id, i]));

  const rows = allRecords.map((r) => {
    const intern = internMap.get(r.internId);
    const { first, last, mi } = parseName(r.internName);
    return {
      'ID':            intern?.studentId ?? r.internId,
      'USER TYPE':     'Intern',
      'USER STATE':    intern?.status ?? '',
      'HONORIFICS':    '',
      'FIRST NAME':    first,
      'LAST NAME':     last,
      'MIDDLE INITIAL': mi,
      'AFFILIATION':   intern?.school ?? '',
      'PURPOSE':       'Internship',
      'EMAIL':         intern?.email ?? '',
      'TIME IN':        fmtTimeRaw(r.timeIn),
      'TIME OUT':       fmtTimeRaw(r.timeOut),
      'DATE OF VISIT':  r.date,
      'MINUTES LATE':   r.minutesLate > 0 ? r.minutesLate : '',
      'PENALTY HOURS':  r.penaltyHours > 0 ? r.penaltyHours : '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Intern Records');
  XLSX.writeFile(wb, `intern-records-${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-emerald-400 animate-spin" />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass-card p-4 flex flex-col gap-1">
      <span className="text-cream/40 text-xs tracking-widest uppercase">{label}</span>
      <span className="text-cream text-3xl font-bold">{value}</span>
      {sub && <span className="text-cream/40 text-xs">{sub}</span>}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:   'bg-emerald-400/15 text-emerald-400',
    done:     'bg-blue-400/15 text-blue-400',
    inactive: 'bg-white/10 text-cream/40',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? map.inactive}`}>
      {status}
    </span>
  );
}

function ClockBadge({ isClockedIn }: { isClockedIn: boolean }) {
  return isClockedIn ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      In
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cream/30 bg-white/5 px-2 py-0.5 rounded-full">
      <span className="h-1.5 w-1.5 rounded-full bg-cream/20" />
      Out
    </span>
  );
}

function Th({ children }: { children: string }) {
  return (
    <th className="text-left text-cream/40 text-xs tracking-wider uppercase py-3 px-4 whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-3 px-4 ${className}`}>{children}</td>;
}

function FormField({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
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

function DateFilter({
  value, onChange,
}: { value: string; onChange: (d: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-cream/40 text-xs tracking-widest uppercase">Date</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent border border-white/15 rounded-lg px-3 py-1.5 text-cream text-sm outline-none focus:border-emerald-400/60"
      />
    </div>
  );
}

// ─── NFC Auth Gate ────────────────────────────────────────────────────────────

type AuthState = 'waiting' | 'checking' | 'error';

function NfcWaveAdminIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 88 88" fill="none">
      <circle cx="18" cy="44" r="5" fill="rgba(255,254,249,0.45)" />
      <path d="M28 24 C44 32 44 56 28 64" stroke="rgba(255,254,249,0.45)" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      <path d="M41 17 C62 28 62 60 41 71" stroke="rgba(255,254,249,0.45)" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      <path d="M55 11 C80 24 80 64 55 77" stroke="rgba(255,254,249,0.45)" strokeWidth="5.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function NfcAuthGate({ onAuthorized, onCancel }: {
  onAuthorized: (staffName: string) => void;
  onCancel: () => void;
}) {
  const [authState, setAuthState] = useState<AuthState>('waiting');
  const [errorMsg, setErrorMsg] = useState('');
  const bufferRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<AuthState>('waiting');

  useEffect(() => { stateRef.current = authState; }, [authState]);

  const processBuffer = useCallback(async () => {
    const uid = bufferRef.current.trim();
    bufferRef.current = '';
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (uid.length < 4) return;

    setAuthState('checking');
    try {
      const staff = await getStaffByNfc(uid);
      if (!staff) {
        setAuthState('error');
        setErrorMsg('Unrecognized card. Authorized staff only.');
        setTimeout(() => setAuthState('waiting'), 2500);
        return;
      }
      onAuthorized(staff.name);
    } catch {
      setAuthState('error');
      setErrorMsg('Could not verify card. Try again.');
      setTimeout(() => setAuthState('waiting'), 2500);
    }
  }, [onAuthorized]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (stateRef.current === 'checking') return;
      if (e.key === 'Escape') { onCancel(); return; }
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
      ].includes(e.key)) return;
      if (e.key === 'Enter') { processBuffer(); return; }
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
  }, [processBuffer, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: 'rgba(13,41,31,0.92)', backdropFilter: 'blur(8px)' }}
    >
      <div className="glass-card w-full max-w-xs p-8 flex flex-col items-center gap-6">
        <div className="text-center">
          <h2 className="text-cream text-xl font-bold">Staff Authorization</h2>
          <p className="text-cream/40 text-sm mt-1">Scan your NFC card to proceed</p>
        </div>

        <div
          className="w-24 h-24 rounded-full border border-white/10 flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          {authState === 'checking' && (
            <div className="w-10 h-10 rounded-full border-4 border-cream/20 border-t-emerald-400 animate-spin" />
          )}
          {authState === 'error' && (
            <span className="text-red-400 text-4xl leading-none">✕</span>
          )}
          {authState === 'waiting' && <NfcWaveAdminIcon />}
        </div>

        {authState === 'waiting' && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]" />
            <span className="text-cream/70 text-sm">Ready to scan</span>
          </div>
        )}
        {authState === 'checking' && (
          <span className="text-cream/50 text-sm">Verifying…</span>
        )}
        {authState === 'error' && (
          <p className="text-red-400 text-sm text-center">{errorMsg}</p>
        )}

        <button
          onClick={onCancel}
          className="text-cream/35 hover:text-cream/60 text-sm transition-colors"
        >Cancel</button>
      </div>
    </div>
  );
}

// ─── Edit Intern Modal ────────────────────────────────────────────────────────

function EditInternModal({ intern, onClose, onSaved }: {
  intern: Intern;
  onClose: () => void;
  onSaved: () => void;
}) {
  const EDIT_MAJORS = (Object.entries(ATTENDANCE.baseHours) as [string, number][]).map(
    ([value, hours]) => ({ value, hours })
  );

  const [form, setForm] = useState({
    name: intern.name,
    email: intern.email,
    studentId: intern.studentId,
    course: intern.course,
    major: intern.major,
    year: intern.year,
    school: intern.school,
    supervisor: intern.supervisor,
    nfcUid: intern.nfcUid,
    status: intern.status,
    startDate: intern.startDate.toDate().toISOString().split('T')[0],
    endDate: intern.endDate.toDate().toISOString().split('T')[0],
    requiredHours: intern.requiredHours,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleMajorChange(value: string) {
    const oldBase = ATTENDANCE.baseHours[intern.major] ?? 0;
    const penalties = Math.max(0, intern.requiredHours - oldBase);
    const newRequired = (ATTENDANCE.baseHours[value] ?? 0) + penalties;
    setForm((f) => ({
      ...f,
      major: value,
      requiredHours: newRequired,
      endDate: f.startDate ? calcEndDate(f.startDate, newRequired) : f.endDate,
    }));
  }

  function handleStartDate(value: string) {
    setForm((f) => ({
      ...f,
      startDate: value,
      endDate: value ? calcEndDate(value, f.requiredHours) : f.endDate,
    }));
  }

  function handleRequiredHours(value: number) {
    if (isNaN(value) || value < 0) return;
    setForm((f) => ({
      ...f,
      requiredHours: value,
      endDate: f.startDate ? calcEndDate(f.startDate, value) : f.endDate,
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.startDate || !form.endDate) return;
    setError('');
    setSaving(true);
    try {
      if (form.name.trim() !== intern.name) {
        await propagateInternNameUpdate(intern.id, form.name.trim());
      }
      await updateIntern(intern.id, {
        name: form.name.trim(),
        email: form.email.trim(),
        studentId: form.studentId.trim(),
        course: form.course.trim(),
        major: form.major,
        year: form.year,
        school: form.school.trim(),
        supervisor: form.supervisor.trim(),
        nfcUid: form.nfcUid.trim(),
        status: form.status,
        startDate: Timestamp.fromDate(new Date(form.startDate + 'T00:00:00')),
        endDate: Timestamp.fromDate(new Date(form.endDate + 'T00:00:00')),
        requiredHours: form.requiredHours,
        remainingHours: Math.max(0, form.requiredHours - intern.completedHours),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(13,41,31,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div
        className="glass-card w-full max-w-2xl p-8 flex flex-col gap-6 overflow-y-auto"
        style={{ maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-cream text-2xl font-bold">Edit Intern</h2>
            <p className="text-cream/40 text-xs mt-0.5">{intern.name}</p>
          </div>
          <button
            onClick={onClose} disabled={saving}
            className="text-cream/50 hover:text-cream text-2xl leading-none transition-colors disabled:opacity-30"
          >✕</button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Full Name" required>
              <input type="text" required value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </FormField>
            <FormField label="Email">
              <input type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Student ID" required>
              <input type="text" required value={form.studentId}
                onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))} />
            </FormField>
            <FormField label="School / University" required>
              <input type="text" required value={form.school}
                onChange={(e) => setForm((f) => ({ ...f, school: e.target.value }))} />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Course" required>
              <input type="text" required value={form.course}
                onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))} />
            </FormField>
            <FormField label="Major" required>
              <select required value={form.major} onChange={(e) => handleMajorChange(e.target.value)}>
                {EDIT_MAJORS.map((m) => (
                  <option key={m.value} value={m.value}>{m.value} — {m.hours}h</option>
                ))}
              </select>
            </FormField>
            <FormField label="Year Level">
              <select value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}>
                {[1, 2, 3].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Supervisor">
              <input type="text" value={form.supervisor}
                onChange={(e) => setForm((f) => ({ ...f, supervisor: e.target.value }))} />
            </FormField>
            <FormField label="NFC Card UID" required>
              <input type="text" required value={form.nfcUid}
                onChange={(e) => setForm((f) => ({ ...f, nfcUid: e.target.value }))} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status">
              <select value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Intern['status'] }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="done">Done</option>
              </select>
            </FormField>
            <FormField label="Required Hours" required>
              <input type="number" min="0" required value={form.requiredHours || ''}
                onChange={(e) => handleRequiredHours(Number(e.target.value))} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" required>
              <input type="date" required value={form.startDate}
                onChange={(e) => handleStartDate(e.target.value)} />
            </FormField>
            <FormField label="End Date (approx.)">
              <input type="date" value={form.endDate} disabled />
            </FormField>
          </div>

          <div className="px-3 py-2 rounded-lg text-xs text-cream/40 border border-white/10 bg-white/5">
            Completed: {Math.round(intern.completedHours)}h · Remaining after save: {Math.max(0, form.requiredHours - intern.completedHours)}h
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose} disabled={saving}
              className="guest-btn flex-1 py-3 text-cream/70 font-medium text-base text-center disabled:opacity-50"
            >Cancel</button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-3 rounded-xl font-semibold text-base text-brand tracking-wide transition-opacity disabled:opacity-50"
              style={{ background: '#FFFEF9' }}
            >{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Manual Clock Modal ───────────────────────────────────────────────────────

function ManualClockModal({ type, intern, onClose, onDone }: {
  type: 'in' | 'out';
  intern: Intern;
  onClose: () => void;
  onDone: () => void;
}) {
  const now = new Date();
  const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [dateTime, setDateTime] = useState(localISO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const selected = new Date(dateTime);
      if (type === 'in') await clockIn(intern.id, selected);
      else await clockOut(intern.id, selected);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally { setSaving(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(13,41,31,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="glass-card w-full max-w-sm p-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-cream text-xl font-bold">Manual Clock {type === 'in' ? 'In' : 'Out'}</h2>
            <p className="text-cream/40 text-sm mt-0.5">{intern.name}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-cream/50 hover:text-cream text-2xl leading-none transition-colors disabled:opacity-30">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FormField label={`Clock ${type === 'in' ? 'In' : 'Out'} Time`} required>
            <input type="datetime-local" required value={dateTime} onChange={(e) => setDateTime(e.target.value)} />
          </FormField>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="guest-btn flex-1 py-3 text-cream/70 font-medium text-base text-center disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-3 rounded-xl font-semibold text-base text-brand tracking-wide transition-opacity disabled:opacity-50"
              style={{ background: '#FFFEF9' }}>
              {saving ? 'Processing…' : `Clock ${type === 'in' ? 'In' : 'Out'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Time Record Modal ────────────────────────────────────────────────────

function EditTimeRecordModal({ record, intern, onClose, onSaved }: {
  record: TimeRecord;
  intern: Intern;
  onClose: () => void;
  onSaved: () => void;
}) {
  function toLocal(ts: { toDate: () => Date }) {
    const d = ts.toDate();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  const [timeIn,  setTimeIn]  = useState(toLocal(record.timeIn));
  const [timeOut, setTimeOut] = useState(record.timeOut ? toLocal(record.timeOut) : '');
  const [notes,   setNotes]   = useState(record.notes || '');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const newTimeIn  = new Date(timeIn);
    const newTimeOut = timeOut ? new Date(timeOut) : null;
    if (newTimeOut && newTimeOut <= newTimeIn) { setError('Clock-out must be after clock-in'); return; }
    setSaving(true);
    try {
      await updateTimeRecord(record.id, intern.id, newTimeIn, newTimeOut, notes);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(13,41,31,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="glass-card w-full max-w-md p-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-cream text-xl font-bold">Edit Time Record</h2>
            <p className="text-cream/40 text-sm mt-0.5">{intern.name} · {record.date}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-cream/50 hover:text-cream text-2xl leading-none transition-colors disabled:opacity-30">✕</button>
        </div>
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Clock In Time" required>
              <input type="datetime-local" required value={timeIn} onChange={(e) => setTimeIn(e.target.value)} />
            </FormField>
            <FormField label="Clock Out Time">
              <input type="datetime-local" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Notes">
            <input type="text" value={notes} placeholder="Optional note" onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <div className="px-3 py-2 rounded-lg text-xs text-cream/40 border border-white/10 bg-white/5">
            Intern hour totals recalculate automatically.
          </div>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="guest-btn flex-1 py-3 text-cream/70 font-medium text-base text-center disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-3 rounded-xl font-semibold text-base text-brand tracking-wide transition-opacity disabled:opacity-50"
              style={{ background: '#FFFEF9' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tab: Interns ─────────────────────────────────────────────────────────────

type InternFilter = 'all' | 'active' | 'clocked' | 'done';

function fmtHours(h: number) {
  const rounded = Math.round(h);
  const days = Math.ceil(rounded / 8);
  return { h: rounded, d: days };
}

function InternTab({ interns, loading, onRefresh, onEdit, onClockIn, onClockOut }: {
  interns: Intern[];
  loading: boolean;
  onRefresh: () => void;
  onEdit: (intern: Intern) => void;
  onClockIn: (intern: Intern) => void;
  onClockOut: (intern: Intern) => void;
}) {
  const [filter, setFilter] = useState<InternFilter>('all');
  const [exporting, setExporting] = useState(false);
  const [recalcing, setRecalcing] = useState(false);

  async function handleExport() {
    setExporting(true);
    try { await exportInternRecordsXLS(interns); }
    finally { setExporting(false); }
  }

  async function handleRecalc() {
    setRecalcing(true);
    try {
      await recalcAllInternHours();
      onRefresh();
    } finally {
      setRecalcing(false);
    }
  }

  const filtered = interns.filter((i) => {
    if (filter === 'active')  return i.status === 'active';
    if (filter === 'clocked') return i.isClockedIn;
    if (filter === 'done')    return i.status === 'done';
    return true;
  });

  const FILTERS: { id: InternFilter; label: string }[] = [
    { id: 'all',     label: 'All' },
    { id: 'active',  label: 'Active' },
    { id: 'clocked', label: 'Clocked In' },
    { id: 'done',    label: 'Done' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Total"          value={interns.length} />
        <Stat label="Active"         value={interns.filter((i) => i.status === 'active').length} />
        <Stat label="Clocked In Now" value={interns.filter((i) => i.isClockedIn).length} />
        <Stat label="Done"           value={interns.filter((i) => i.status === 'done').length} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                filter === f.id
                  ? 'border-emerald-400/60 text-emerald-400 bg-emerald-400/10'
                  : 'border-white/10 text-cream/50 hover:text-cream/70'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onRefresh} className="text-cream/40 hover:text-cream/70 text-sm transition-colors">
            Refresh
          </button>
          <button
            onClick={handleRecalc}
            disabled={recalcing || interns.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-400/40 text-amber-400 hover:bg-amber-400/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {recalcing ? 'Recalculating…' : 'Recalculate Hours'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || interns.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-400/40 text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {exporting ? 'Exporting…' : 'Export XLS'}
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10">
                <tr>
                  {['Name','Major','Year','School','Status','Clock','Hrs Done','Hrs Left','Start','End',''].map((h, idx) => (
                    <Th key={idx}>{h}</Th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center text-cream/30 py-16">No interns found</td></tr>
                ) : filtered.map((i) => (
                  <tr key={i.id} className="hover:bg-white/5 transition-colors">
                    <Td className="text-cream font-medium">{i.name}</Td>
                    <Td className="text-cream/70">{i.major}</Td>
                    <Td className="text-cream/70">{i.year}</Td>
                    <Td className="text-cream/60 max-w-37.5 truncate">{i.school}</Td>
                    <Td><Badge status={i.status} /></Td>
                    <Td><ClockBadge isClockedIn={i.isClockedIn} /></Td>
                    <Td>
                      <span className="text-cream/70">{fmtHours(i.completedHours).h}h</span>
                      <span className="text-cream/40 text-xs ml-1">({fmtHours(i.completedHours).d}d)</span>
                    </Td>
                    <Td>
                      <span className="text-cream/70">{fmtHours(i.remainingHours).h}h</span>
                      <span className="text-cream/40 text-xs ml-1">({fmtHours(i.remainingHours).d}d)</span>
                    </Td>
                    <Td className="text-cream/50 text-xs">{fmtDate(i.startDate.toDate())}</Td>
                    <Td className="text-cream/50 text-xs">{fmtDate(i.endDate.toDate())}</Td>
                    <Td>
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          onClick={() => onEdit(i)}
                          className="text-xs px-2 py-1 rounded border border-white/15 text-cream/50 hover:text-cream hover:border-white/30 transition-colors"
                        >Edit</button>
                        {!i.isClockedIn ? (
                          <button
                            onClick={() => onClockIn(i)}
                            className="text-xs px-2 py-1 rounded border border-emerald-400/30 text-emerald-400/60 hover:text-emerald-400 hover:border-emerald-400/60 transition-colors"
                          >Clock In</button>
                        ) : (
                          <button
                            onClick={() => onClockOut(i)}
                            className="text-xs px-2 py-1 rounded border border-amber-400/30 text-amber-400/60 hover:text-amber-400 hover:border-amber-400/60 transition-colors"
                          >Clock Out</button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Create Event Modal ───────────────────────────────────────────────────────

function CreateEventModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (data: EventCreate) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    location: '',
    date: todayStr,
    startTime: '08:00',
    organizer: '',
    expectedGuests: 0,
  });
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.date) { setError('Name and date are required'); return; }
    const startDateTime = new Date(`${form.date}T${form.startTime}:00`);
    const data: EventCreate = {
      name: form.name.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      date: form.date,
      startTime: Timestamp.fromDate(startDateTime),
      endTime: null,
      organizer: form.organizer.trim(),
      expectedGuests: form.expectedGuests,
      actualGuestCount: 0,
      status: 'upcoming',
    };
    onSubmit(data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(13,41,31,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card w-full max-w-lg p-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-cream text-xl font-bold">Create Event</h2>
            <p className="text-cream/40 text-xs mt-0.5">Staff card required to confirm</p>
          </div>
          <button onClick={onClose} className="text-cream/50 hover:text-cream text-2xl leading-none transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Event Name" required>
            <input type="text" required placeholder="e.g. Industry Visit 2026"
              value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Description">
            <input type="text" placeholder="Brief event description"
              value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Location">
              <input type="text" placeholder="Room / Building"
                value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            </FormField>
            <FormField label="Organizer">
              <input type="text" placeholder="Organizer name"
                value={form.organizer} onChange={(e) => setForm((f) => ({ ...f, organizer: e.target.value }))} />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Date" required>
              <input type="date" required value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </FormField>
            <FormField label="Start Time">
              <input type="time" value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
            </FormField>
            <FormField label="Expected Guests">
              <input type="number" min="0" value={form.expectedGuests || ''}
                onChange={(e) => setForm((f) => ({ ...f, expectedGuests: Number(e.target.value) }))} />
            </FormField>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="guest-btn flex-1 py-3 text-cream/70 font-medium text-base text-center">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 py-3 rounded-xl font-semibold text-base text-brand tracking-wide"
              style={{ background: '#FFFEF9' }}>
              Create Event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Events Panel ─────────────────────────────────────────────────────────────

function EventStatusBadge({ status }: { status: Event['status'] }) {
  const map: Record<Event['status'], string> = {
    upcoming:  'bg-blue-400/15 text-blue-400',
    ongoing:   'bg-emerald-400/15 text-emerald-400',
    completed: 'bg-white/10 text-cream/40',
    cancelled: 'bg-red-400/15 text-red-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status]}`}>
      {status}
    </span>
  );
}

function EventsPanel({ events, loading, onNewEvent, onSetActive, onEndEvent }: {
  events: Event[];
  loading: boolean;
  onNewEvent: () => void;
  onSetActive: (id: string) => void;
  onEndEvent: (id: string) => void;
}) {
  const activeEvent = events.find((e) => e.status === 'ongoing');

  return (
    <div className="glass-card flex flex-col gap-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <h3 className="text-cream font-semibold">Events</h3>
          {activeEvent && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              {activeEvent.name}
            </span>
          )}
        </div>
        <button
          onClick={onNewEvent}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-400/40 text-emerald-400 hover:bg-emerald-400/10 transition-all"
        >
          + New Event
        </button>
      </div>

      {loading ? <Spinner /> : events.length === 0 ? (
        <p className="text-cream/30 text-sm text-center py-8">No events yet</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-white/10">
            <tr>
              {['Name', 'Date', 'Location', 'Organizer', 'Expected', 'Checked In', 'Status', ''].map((h, idx) => (
                <Th key={idx}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {events.map((ev) => (
              <tr key={ev.id} className="hover:bg-white/5 transition-colors">
                <td className="py-3 px-4 text-cream font-medium">{ev.name}</td>
                <td className="py-3 px-4 text-cream/70">{ev.date}</td>
                <td className="py-3 px-4 text-cream/60 max-w-28 truncate">{ev.location || '—'}</td>
                <td className="py-3 px-4 text-cream/60">{ev.organizer || '—'}</td>
                <td className="py-3 px-4 text-cream/60">{ev.expectedGuests || '—'}</td>
                <td className="py-3 px-4 text-cream/70">{ev.actualGuestCount}</td>
                <td className="py-3 px-4"><EventStatusBadge status={ev.status} /></td>
                <td className="py-3 px-4">
                  <div className="flex gap-1.5">
                    {ev.status !== 'ongoing' && ev.status !== 'completed' && ev.status !== 'cancelled' && (
                      <button
                        onClick={() => onSetActive(ev.id)}
                        className="text-xs px-2 py-1 rounded border border-emerald-400/30 text-emerald-400/70 hover:text-emerald-400 hover:border-emerald-400/60 transition-colors whitespace-nowrap"
                      >
                        Set Active
                      </button>
                    )}
                    {ev.status === 'ongoing' && (
                      <button
                        onClick={() => onEndEvent(ev.id)}
                        className="text-xs px-2 py-1 rounded border border-amber-400/30 text-amber-400/70 hover:text-amber-400 hover:border-amber-400/60 transition-colors"
                      >
                        End
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Tab: Guests ──────────────────────────────────────────────────────────────

function GuestTab({ guests, loading, date, onDateChange, events, eventsLoading, onNewEvent, onSetActive, onEndEvent }: {
  guests: Guest[];
  loading: boolean;
  date: string;
  onDateChange: (d: string) => void;
  events: Event[];
  eventsLoading: boolean;
  onNewEvent: () => void;
  onSetActive: (id: string) => void;
  onEndEvent: (id: string) => void;
}) {
  const checkedOut   = guests.filter((g) => g.checkOutTime !== null);
  const stillInside  = guests.length - checkedOut.length;
  const avgDuration  = checkedOut.length > 0
    ? (checkedOut.reduce((s, g) => s + (g.hoursVisited ?? 0), 0) / checkedOut.length).toFixed(1)
    : '0';

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total Guests"  value={guests.length} />
        <Stat label="Still Inside"  value={stillInside} />
        <Stat label="Avg Duration"  value={`${avgDuration}h`} />
      </div>

      <EventsPanel
        events={events}
        loading={eventsLoading}
        onNewEvent={onNewEvent}
        onSetActive={onSetActive}
        onEndEvent={onEndEvent}
      />

      <DateFilter value={date} onChange={onDateChange} />

      <div className="glass-card overflow-hidden">
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10">
                <tr>
                  {['Name','Age','Gender','Organization','Purpose','Event','Check-In','Check-Out','Duration','Handled By'].map((h) => (
                    <Th key={h}>{h}</Th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {guests.length === 0 ? (
                  <tr><td colSpan={10} className="text-center text-cream/30 py-16">No guests for this date</td></tr>
                ) : guests.map((g) => (
                  <tr key={g.id} className="hover:bg-white/5 transition-colors">
                    <Td className="text-cream font-medium">{g.name}</Td>
                    <Td className="text-cream/70">{g.age}</Td>
                    <Td className="text-cream/70">{g.gender}</Td>
                    <Td className="text-cream/60 max-w-32.5 truncate">{g.organization || '—'}</Td>
                    <Td className="text-cream/60 max-w-[130px] truncate">{g.purpose}</Td>
                    <Td className="text-cream/60 max-w-30 truncate">{g.eventName || '—'}</Td>
                    <Td className="text-cream/70">{fmtTime(g.checkInTime)}</Td>
                    <Td className="text-cream/70">{fmtTime(g.checkOutTime)}</Td>
                    <Td className="text-cream/70">{g.hoursVisited != null ? `${g.hoursVisited}h` : '—'}</Td>
                    <Td className="text-cream/50 text-xs">{g.handledBy}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Time Records ────────────────────────────────────────────────────────

function RecordsTab({ records, loading, date, onDateChange, onEditRecord }: {
  records: TimeRecord[];
  loading: boolean;
  date: string;
  onDateChange: (d: string) => void;
  onEditRecord: (record: TimeRecord) => void;
}) {
  const lateCount  = records.filter((r) => r.isLate).length;
  const totalHours = records.reduce((s, r) => s + (r.hoursRendered ?? 0), 0);


  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Present"      value={records.length} />
        <Stat label="Late"         value={lateCount} />
        <Stat label="Total Hours"  value={`${totalHours.toFixed(1)}h`} />
      </div>

      <DateFilter value={date} onChange={onDateChange} />

      <div className="glass-card overflow-hidden">
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10">
                <tr>
                  {['Intern','Major','Time In','Time Out','Hours','Status','Min Late','Penalty','Notes',''].map((h, idx) => (
                    <Th key={idx}>{h}</Th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {records.length === 0 ? (
                  <tr><td colSpan={9} className="text-center text-cream/30 py-16">No records for this date</td></tr>
                ) : records.map((r) => (
                  <tr key={r.id} className="hover:bg-white/5 transition-colors">
                    <Td className="text-cream font-medium">{r.internName}</Td>
                    <Td className="text-cream/70">{r.major}</Td>
                    <Td className="text-cream/70">{fmtTime(r.timeIn)}</Td>
                    <Td className="text-cream/70">{fmtTime(r.timeOut)}</Td>
                    <Td className="text-cream/70">{r.hoursRendered != null ? `${r.hoursRendered}h` : '—'}</Td>
                    <Td>
                      {r.isLate
                        ? <span className="text-xs text-red-400 font-medium">Late</span>
                        : <span className="text-xs text-emerald-400">On Time</span>
                      }
                    </Td>
                    <Td className="text-cream/70">
                      {r.minutesLate > 0 ? <span className="text-red-400">{r.minutesLate}m late</span> : '—'}
                    </Td>
                    <Td>
                      {r.penaltyHours > 0
                        ? <span className="text-red-400 text-xs font-medium">+{r.penaltyHours}h</span>
                        : <span className="text-cream/40">—</span>}
                    </Td>
                    <Td className="text-cream/40 text-xs">{r.notes || '—'}</Td>
                    <Td>
                      <button
                        onClick={() => onEditRecord(r)}
                        className="text-xs px-2 py-1 rounded border border-white/15 text-cream/50 hover:text-cream hover:border-white/30 transition-colors"
                      >Edit</button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Closed Days ────────────────────────────────────────────────────────

function ClosedDaysTab({ closedDays, loading, onAddDay, onRemoveDay, onRefresh }: {
  closedDays: ClosedDay[];
  loading: boolean;
  onAddDay: (date: string, reason: string) => void;
  onRemoveDay: (id: string, date: string) => void;
  onRefresh: () => void;
}) {
  const [newDate,   setNewDate]   = useState('');
  const [newReason, setNewReason] = useState('');

  function handleAdd() {
    if (!newDate) return;
    onAddDay(newDate, newReason.trim() || 'No classes');
    setNewDate('');
    setNewReason('');
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="glass-card p-6 flex flex-col gap-4">
        <div>
          <h3 className="text-cream font-semibold">Mark Closed Day</h3>
          <p className="text-cream/40 text-xs mt-1">
            Closed days are skipped in end-date calculations. All active intern schedules recalculate after saving.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 items-end">
          <FormField label="Date" required>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </FormField>
          <FormField label="Reason">
            <input type="text" placeholder="No classes" value={newReason} onChange={(e) => setNewReason(e.target.value)} />
          </FormField>
          <button
            onClick={handleAdd}
            disabled={!newDate}
            className="py-2.5 rounded-xl font-semibold text-sm text-brand disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#FFFEF9' }}
          >Mark Day</button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-cream font-semibold">Closed Days ({closedDays.length})</h3>
          <button onClick={onRefresh} className="text-cream/40 hover:text-cream/70 text-sm transition-colors">Refresh</button>
        </div>
        {loading ? <Spinner /> : closedDays.length === 0 ? (
          <p className="text-cream/30 text-sm text-center py-12">No closed days marked</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-white/10">
              <tr>{['Date', 'Reason', ''].map((h, idx) => <Th key={idx}>{h}</Th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {closedDays.map((d) => (
                <tr key={d.id} className="hover:bg-white/5 transition-colors">
                  <Td className="text-cream font-medium">{d.date}</Td>
                  <Td className="text-cream/60">{d.reason || '—'}</Td>
                  <Td>
                    <button
                      onClick={() => onRemoveDay(d.id, d.date)}
                      className="text-xs px-2 py-1 rounded border border-red-400/25 text-red-400/60 hover:text-red-400 hover:border-red-400/50 transition-colors"
                    >Remove</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Analytics: Chart Primitives ─────────────────────────────────────────────

type DailyPoint = { date: string; count: number; lateCount: number };

function fillAttendanceGaps(raw: DailyPoint[], days = 30): DailyPoint[] {
  const map = new Map(raw.map((d) => [d.date, d]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().split('T')[0];
    return map.get(key) ?? { date: key, count: 0, lateCount: 0 };
  });
}

function AttendanceTrendChart({ raw }: { raw: DailyPoint[] }) {
  const data = fillAttendanceGaps(raw, 30);
  const W = 460, H = 124;
  const PL = 26, PR = 8, PT = 10, PB = 22;
  const iW = W - PL - PR, iH = H - PT - PB;
  const maxY = Math.max(...data.map((d) => d.count), 1);

  const px = (i: number) => PL + (i / (data.length - 1)) * iW;
  const py = (v: number) => PT + iH - (v / maxY) * iH;

  const attendPts = data.map((d, i) => `${px(i).toFixed(1)},${py(d.count).toFixed(1)}`).join(' ');
  const latePts   = data.map((d, i) => `${px(i).toFixed(1)},${py(d.lateCount).toFixed(1)}`).join(' ');
  const areaD = `M ${px(0)},${py(data[0].count)} ` +
    data.slice(1).map((d, i) => `L ${px(i + 1).toFixed(1)},${py(d.count).toFixed(1)}`).join(' ') +
    ` L ${px(data.length - 1)},${(PT + iH).toFixed(1)} L ${px(0)},${(PT + iH).toFixed(1)} Z`;

  const yTicks = maxY <= 3
    ? Array.from({ length: maxY + 1 }, (_, v) => v)
    : [0, Math.round(maxY / 2), maxY];

  const xTickIdxs: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0 || i === data.length - 1 || i % 7 === 0) xTickIdxs.push(i);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
      <defs>
        <linearGradient id="attendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#4ade80" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#4ade80" stopOpacity="0"   />
        </linearGradient>
      </defs>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PL} x2={W - PR} y1={py(v)} y2={py(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <text x={PL - 3} y={py(v) + 3.5} textAnchor="end" fontSize="8.5" fill="rgba(255,254,249,0.28)">{v}</text>
        </g>
      ))}
      <path d={areaD} fill="url(#attendGrad)" />
      <polyline points={attendPts} fill="none" stroke="#4ade80"  strokeWidth="1.5" strokeLinejoin="round" />
      <polyline points={latePts}   fill="none" stroke="#f87171"  strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="3,2" />
      {data.filter((_, i) => i % 7 === 0).map((d, ii) => (
        <circle key={d.date} cx={px(ii * 7)} cy={py(d.count)} r="2.2" fill="#4ade80" />
      ))}
      {xTickIdxs.map((i) => (
        <text key={i} x={px(i)} y={H - 3} textAnchor="middle" fontSize="8" fill="rgba(255,254,249,0.28)">
          {data[i].date.slice(5)}
        </text>
      ))}
    </svg>
  );
}

function PunctualityDonut({ onTime, late }: { onTime: number; late: number }) {
  const total = onTime + late;
  const r = 40, cx = 56, cy = 52;
  const circ = 2 * Math.PI * r;
  const pct  = total > 0 ? onTime / total : 1;
  const dash = pct * circ;

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 112 104" width="112" height="104">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={pct >= 0.8 ? '#4ade80' : pct >= 0.6 ? '#fbbf24' : '#f87171'}
          strokeWidth="14"
          strokeDasharray={`${dash.toFixed(2)} ${(circ - dash).toFixed(2)}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeLinecap="butt"
        />
        <text x={cx} y={cy - 4}  textAnchor="middle" fontSize="17" fontWeight="700" fill="#fffef9">
          {Math.round(pct * 100)}%
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8"  fill="rgba(255,254,249,0.4)">
          ON TIME
        </text>
      </svg>
      <div className="flex gap-5 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-cream/50">{onTime} on time</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400/70" />
          <span className="text-cream/50">{late} late</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Analytics ───────────────────────────────────────────────────────────

function AnalyticsTab({ analytics, hoursByMajor, nearCompletion, dailyAttendance, loading, onRefresh }: {
  analytics: InternAnalyticsSummary[];
  hoursByMajor: Record<string, number>;
  nearCompletion: Intern[];
  dailyAttendance: DailyPoint[];
  loading: boolean;
  onRefresh: () => void;
}) {
  // ── KPI rollups ──────────────────────────────────────────────────────────────
  const avgAttendance = analytics.length > 0
    ? (analytics.reduce((s, a) => s + a.attendanceRate, 0) / analytics.length).toFixed(1)
    : 0;

  const totalPresent = analytics.reduce((s, a) => s + a.totalDaysPresent, 0);
  const totalLate    = analytics.reduce((s, a) => s + a.totalDaysLate,    0);
  const totalOnTime  = totalPresent - totalLate;

  // ── Progress board: sorted by % completion descending ─────────────────────
  const progressData = [...analytics]
    .map((a) => {
      const required = a.completedHours + a.remainingHours;
      const pct = required > 0 ? Math.round((a.completedHours / required) * 100) : 0;
      return { name: a.internName, major: a.major, pct, completed: a.completedHours, required };
    })
    .sort((a, b) => b.pct - a.pct);

  // ── Tardiness leaderboard: top 8 latecomers ──────────────────────────────
  const lateData = [...analytics]
    .filter((a) => a.totalDaysLate > 0)
    .sort((a, b) => b.totalDaysLate - a.totalDaysLate)
    .slice(0, 8);
  const maxLate = lateData.length > 0 ? lateData[0].totalDaysLate : 1;

  // ── Hours by major ────────────────────────────────────────────────────────
  const maxHours = Math.max(...Object.values(hoursByMajor), 1);

  return (
    <div className="flex flex-col gap-6">
      {loading ? <Spinner /> : (
        <>
          {/* Row 1: KPI stats */}
          <div className="grid grid-cols-4 gap-4">
            <Stat label="Interns Tracked"  value={analytics.length} />
            <Stat label="Avg Attendance"   value={`${avgAttendance}%`} />
            <Stat label="Total Days Late"  value={totalLate} sub={`${totalPresent} total check-ins`} />
            <Stat label="Near Completion"  value={nearCompletion.length} sub="within 20h remaining" />
          </div>

          {/* Row 2: Attendance trend + Punctuality donut */}
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2 glass-card p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-cream font-semibold">30-Day Attendance Trend</h3>
                  <p className="text-cream/35 text-xs mt-0.5">Daily check-ins (green) vs late arrivals (red dashed)</p>
                </div>
                <div className="flex gap-4 text-xs text-cream/40">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 h-0.5 bg-emerald-400 rounded" />
                    Present
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 h-px bg-red-400/70" style={{ backgroundImage: 'repeating-linear-gradient(90deg,rgba(248,113,113,0.7) 0,rgba(248,113,113,0.7) 3px,transparent 3px,transparent 5px)' }} />
                    Late
                  </span>
                </div>
              </div>
              {dailyAttendance.length === 0 && analytics.length === 0
                ? <p className="text-cream/25 text-sm">No data yet</p>
                : <AttendanceTrendChart raw={dailyAttendance} />
              }
            </div>

            <div className="glass-card p-6 flex flex-col gap-4">
              <div>
                <h3 className="text-cream font-semibold">Punctuality</h3>
                <p className="text-cream/35 text-xs mt-0.5">All-time on-time rate</p>
              </div>
              <div className="flex flex-1 items-center justify-center">
                <PunctualityDonut onTime={totalOnTime} late={totalLate} />
              </div>
            </div>
          </div>

          {/* Row 3: Progress board + Tardiness ranking */}
          <div className="grid grid-cols-2 gap-6">
            {/* Hours progress per intern */}
            <div className="glass-card p-6 flex flex-col gap-4">
              <div>
                <h3 className="text-cream font-semibold">Hours Progress</h3>
                <p className="text-cream/35 text-xs mt-0.5">Completed vs required hours per intern</p>
              </div>
              {progressData.length === 0 ? (
                <p className="text-cream/25 text-sm">No data yet</p>
              ) : (
                <div className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 260 }}>
                  {progressData.map((p) => (
                    <div key={p.name} className="flex items-center gap-3">
                      <div className="w-24 shrink-0">
                        <p className="text-cream/80 text-xs font-medium truncate leading-tight">
                          {p.name.split(' ')[0]}
                        </p>
                        <p className="text-cream/30 text-[10px]">{p.major}</p>
                      </div>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${p.pct}%`,
                            background: p.pct >= 80 ? '#4ade80' : p.pct >= 50 ? '#fbbf24' : '#f87171',
                          }}
                        />
                      </div>
                      <span className="text-cream/50 text-xs w-9 text-right shrink-0">{p.pct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tardiness leaderboard */}
            <div className="glass-card p-6 flex flex-col gap-4">
              <div>
                <h3 className="text-cream font-semibold">Tardiness Ranking</h3>
                <p className="text-cream/35 text-xs mt-0.5">Interns with the most late arrivals</p>
              </div>
              {lateData.length === 0 ? (
                <p className="text-cream/25 text-sm">No late arrivals recorded</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {lateData.map((a, idx) => (
                    <div key={a.internId} className="flex items-center gap-3">
                      <span className="text-cream/25 text-xs w-4 shrink-0 text-right">{idx + 1}</span>
                      <div className="w-24 shrink-0">
                        <p className="text-cream/80 text-xs font-medium truncate leading-tight">
                          {a.internName.split(' ')[0]}
                        </p>
                        <p className="text-cream/30 text-[10px]">{a.major}</p>
                      </div>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div
                          className="h-full rounded-full bg-red-400/70 transition-all"
                          style={{ width: `${(a.totalDaysLate / maxLate) * 100}%` }}
                        />
                      </div>
                      <span className="text-red-400/80 text-xs w-12 text-right shrink-0">
                        {a.totalDaysLate}x late
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 4: Hours by major + Near completion */}
          <div className="grid grid-cols-2 gap-6">
            <div className="glass-card p-6 flex flex-col gap-4">
              <h3 className="text-cream font-semibold">Hours Rendered by Major</h3>
              {Object.keys(hoursByMajor).length === 0 ? (
                <p className="text-cream/30 text-sm">No data yet</p>
              ) : Object.entries(hoursByMajor).map(([major, hours]) => (
                <div key={major} className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-cream/70">{major}</span>
                    <span className="text-cream font-medium">{hours}h</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all"
                      style={{ width: `${(hours / maxHours) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="glass-card p-6 flex flex-col gap-4">
              <h3 className="text-cream font-semibold">Near Completion</h3>
              {nearCompletion.length === 0 ? (
                <p className="text-cream/30 text-sm">No interns within 20h of completing</p>
              ) : nearCompletion.map((i) => (
                <div key={i.id} className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-cream text-sm font-medium">{i.name}</p>
                    <p className="text-cream/40 text-xs">{i.major}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-amber-400 text-sm font-semibold">{fmtHours(i.remainingHours).h}h left</span>
                    <p className="text-amber-400/60 text-xs">{fmtHours(i.remainingHours).d} days</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Row 5: Per-intern performance table */}
          <div className="glass-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-cream font-semibold">Intern Performance</h3>
              <button onClick={onRefresh} className="text-cream/40 hover:text-cream/70 text-sm transition-colors">
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10">
                  <tr>
                    {['Name','Major','Days Present','Days Late','Attendance','Avg Daily Hrs','Completed','Remaining','Status'].map((h) => (
                      <Th key={h}>{h}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {analytics.length === 0 ? (
                    <tr><td colSpan={9} className="text-center text-cream/30 py-16">No analytics data</td></tr>
                  ) : analytics.map((a) => (
                    <tr key={a.internId} className="hover:bg-white/5 transition-colors">
                      <Td className="text-cream font-medium">{a.internName}</Td>
                      <Td className="text-cream/70">{a.major}</Td>
                      <Td className="text-cream/70">{a.totalDaysPresent}</Td>
                      <Td>
                        <span className={a.totalDaysLate > 0 ? 'text-red-400 font-medium' : 'text-cream/70'}>
                          {a.totalDaysLate}
                        </span>
                      </Td>
                      <Td className="text-cream/70">{a.attendanceRate}%</Td>
                      <Td className="text-cream/70">{a.averageDailyHours}h</Td>
                      <Td className="text-cream/70">{Math.round(a.completedHours)}h</Td>
                      <Td className="text-cream/70">{Math.round(a.remainingHours)}h</Td>
                      <Td><Badge status={a.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('interns');

  const [interns, setInterns]         = useState<Intern[]>([]);
  const [internsLoaded, setInternsLoaded] = useState(false);
  const [internsLoading, setInternsLoading] = useState(false);
  const [pendingAction,  setPendingAction]  = useState<AuthAction | null>(null);
  const [editingIntern,  setEditingIntern]  = useState<Intern | null>(null);
  const [manualClocking, setManualClocking] = useState<{ type: 'in' | 'out'; intern: Intern } | null>(null);
  const [editingRecord,  setEditingRecord]  = useState<{ record: TimeRecord; intern: Intern } | null>(null);

  const [guestDate, setGuestDate]   = useState(todayStr);
  const [guests, setGuests]         = useState<Guest[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(false);
  const [events, setEvents]         = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [creatingEventForm, setCreatingEventForm] = useState(false);

  const [recordDate, setRecordDate]     = useState(todayStr);
  const [records, setRecords]           = useState<TimeRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [analytics, setAnalytics]               = useState<InternAnalyticsSummary[]>([]);
  const [hoursByMajor, setHoursByMajor]         = useState<Record<string, number>>({});
  const [nearCompletion, setNearCompletion]     = useState<Intern[]>([]);
  const [dailyAttendance, setDailyAttendance]   = useState<DailyPoint[]>([]);
  const [analyticsLoaded, setAnalyticsLoaded]   = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [closedDays,        setClosedDays]        = useState<ClosedDay[]>([]);
  const [closedDaysLoaded,  setClosedDaysLoaded]  = useState(false);
  const [closedDaysLoading, setClosedDaysLoading] = useState(false);

  const fetchInterns = useCallback(async () => {
    setInternsLoading(true);
    try {
      setInterns(await getAllInterns());
      setInternsLoaded(true);
    } finally { setInternsLoading(false); }
  }, []);

  const fetchGuests = useCallback(async (date: string) => {
    setGuestsLoading(true);
    try { setGuests(await getGuestsByDate(date)); }
    finally { setGuestsLoading(false); }
  }, []);

  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    try { setEvents(await getAllEvents()); }
    finally { setEventsLoading(false); }
  }, []);

  const fetchRecords = useCallback(async (date: string) => {
    setRecordsLoading(true);
    try { setRecords(await getTimeRecordsByDate(date)); }
    finally { setRecordsLoading(false); }
  }, []);

  const fetchClosedDays = useCallback(async () => {
    setClosedDaysLoading(true);
    try { setClosedDays(await getClosedDays()); setClosedDaysLoaded(true); }
    finally { setClosedDaysLoading(false); }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const from30 = new Date();
      from30.setDate(from30.getDate() - 29);
      const [a, hbm, nc, da] = await Promise.all([
        getAllInternAnalytics(),
        getHoursByMajor(),
        getInternsNearCompletion(),
        getDailyAttendance(from30, new Date()),
      ]);
      setAnalytics(a);
      setHoursByMajor(hbm);
      setNearCompletion(nc);
      setDailyAttendance(da);
      setAnalyticsLoaded(true);
    } finally { setAnalyticsLoading(false); }
  }, []);

  useEffect(() => {
    // Each fetch function calls setLoading(true) synchronously then awaits data.
    // This is React's own documented data-fetching pattern, so we suppress the rule.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (tab === 'interns'    && !internsLoaded)    fetchInterns();
    if (tab === 'guests')                          { fetchGuests(guestDate); fetchEvents(); }
    if (tab === 'records')                         fetchRecords(recordDate);
    if (tab === 'analytics'  && !analyticsLoaded)  fetchAnalytics();
    if (tab === 'closedDays' && !closedDaysLoaded) fetchClosedDays();
    /* eslint-enable react-hooks/set-state-in-effect */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleSignOut() {
    await adminSignOut();
    router.replace('/admin/login');
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'interns',    label: 'Interns' },
    { id: 'guests',     label: 'Guests' },
    { id: 'records',    label: 'Time Records' },
    { id: 'analytics',  label: 'Analytics' },
    { id: 'closedDays', label: 'Closed Days' },
  ];

  return (
    <div className="h-screen overflow-y-auto">
      {/* Sticky header */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-8 py-4 border-b border-white/10"
        style={{ background: '#0D291F' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 font-bold text-lg tracking-wide">InTTO</span>
          <span className="text-cream/25">|</span>
          <span className="text-cream font-semibold">Admin Dashboard</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-cream/40 text-sm">{auth.currentUser?.email}</span>
          <button
            onClick={handleSignOut}
            className="text-cream/50 hover:text-cream text-sm transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/25"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="p-8 flex flex-col gap-6">
        {/* Tab bar */}
        <div
          className="flex gap-1 p-1 rounded-xl"
          style={{ background: 'rgba(255,254,249,0.04)', border: '1px solid rgba(100,200,150,0.1)' }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? 'text-brand font-semibold' : 'text-cream/50 hover:text-cream/80'
              }`}
              style={tab === t.id ? { background: '#FFFEF9' } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'interns' && (
          <InternTab
            interns={interns}
            loading={internsLoading}
            onRefresh={fetchInterns}
            onEdit={(i) => setPendingAction({ type: 'edit', intern: i })}
            onClockIn={(i) => setPendingAction({ type: 'clock-in', intern: i })}
            onClockOut={(i) => setPendingAction({ type: 'clock-out', intern: i })}
          />
        )}
        {pendingAction && (
          <NfcAuthGate
            onAuthorized={() => {
              const action = pendingAction;
              setPendingAction(null);
              if (action.type === 'edit') {
                setEditingIntern(action.intern);
              } else if (action.type === 'clock-in' || action.type === 'clock-out') {
                setManualClocking({ type: action.type === 'clock-in' ? 'in' : 'out', intern: action.intern });
              } else if (action.type === 'edit-record') {
                setEditingRecord({ record: action.record, intern: action.intern });
              } else if (action.type === 'add-closed-day') {
                (async () => {
                  await addClosedDay(action.date, action.reason);
                  const days = await getClosedDays();
                  setClosedDays(days);
                  await recalcAllInternEndDates(days.map((d) => d.date));
                  await fetchInterns();
                })().catch(console.error);
              } else if (action.type === 'remove-closed-day') {
                (async () => {
                  await removeClosedDay(action.id);
                  const days = await getClosedDays();
                  setClosedDays(days);
                  await recalcAllInternEndDates(days.map((d) => d.date));
                  await fetchInterns();
                })().catch(console.error);
              } else if (action.type === 'create-event') {
                (async () => {
                  await createEvent(action.data);
                  await fetchEvents();
                })().catch(console.error);
              } else if (action.type === 'set-event-active') {
                (async () => {
                  await updateEvent(action.id, { status: 'ongoing' });
                  await fetchEvents();
                })().catch(console.error);
              } else if (action.type === 'end-event') {
                (async () => {
                  await updateEvent(action.id, { status: 'completed' });
                  await fetchEvents();
                })().catch(console.error);
              }
            }}
            onCancel={() => setPendingAction(null)}
          />
        )}
        {editingIntern && (
          <EditInternModal
            intern={editingIntern}
            onClose={() => setEditingIntern(null)}
            onSaved={fetchInterns}
          />
        )}
        {manualClocking && (
          <ManualClockModal
            type={manualClocking.type}
            intern={manualClocking.intern}
            onClose={() => setManualClocking(null)}
            onDone={fetchInterns}
          />
        )}
        {editingRecord && (
          <EditTimeRecordModal
            record={editingRecord.record}
            intern={editingRecord.intern}
            onClose={() => setEditingRecord(null)}
            onSaved={() => { fetchInterns(); fetchRecords(recordDate); }}
          />
        )}
        {creatingEventForm && (
          <CreateEventModal
            onClose={() => setCreatingEventForm(false)}
            onSubmit={(data) => {
              setCreatingEventForm(false);
              setPendingAction({ type: 'create-event', data });
            }}
          />
        )}
        {tab === 'guests' && (
          <GuestTab
            guests={guests}
            loading={guestsLoading}
            date={guestDate}
            onDateChange={(d) => { setGuestDate(d); fetchGuests(d); }}
            events={events}
            eventsLoading={eventsLoading}
            onNewEvent={() => setCreatingEventForm(true)}
            onSetActive={(id) => setPendingAction({ type: 'set-event-active', id })}
            onEndEvent={(id) => setPendingAction({ type: 'end-event', id })}
          />
        )}
        {tab === 'records' && (
          <RecordsTab
            records={records}
            loading={recordsLoading}
            date={recordDate}
            onDateChange={(d) => { setRecordDate(d); fetchRecords(d); }}
            onEditRecord={(r) => {
              const intern = interns.find((i) => i.id === r.internId);
              if (intern) setPendingAction({ type: 'edit-record', record: r, intern });
            }}
          />
        )}
        {tab === 'closedDays' && (
          <ClosedDaysTab
            closedDays={closedDays}
            loading={closedDaysLoading}
            onAddDay={(date, reason) => setPendingAction({ type: 'add-closed-day', date, reason })}
            onRemoveDay={(id, date) => setPendingAction({ type: 'remove-closed-day', id, date })}
            onRefresh={fetchClosedDays}
          />
        )}
        {tab === 'analytics' && (
          <AnalyticsTab
            analytics={analytics}
            hoursByMajor={hoursByMajor}
            nearCompletion={nearCompletion}
            dailyAttendance={dailyAttendance}
            loading={analyticsLoading}
            onRefresh={fetchAnalytics}
          />
        )}
      </div>
    </div>
  );
}
