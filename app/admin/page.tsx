'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { adminSignOut } from '@/lib/auth';
import {
  getAllInterns,
  getGuestsByDate,
  getTimeRecordsByDate,
  getAllInternAnalytics,
  getHoursByMajor,
  getInternsNearCompletion,
} from '@/lib/firestore';
import type { Intern, Guest, TimeRecord, InternAnalyticsSummary } from '@/lib/firestore';

type Tab = 'interns' | 'guests' | 'records' | 'analytics';

const todayStr = new Date().toISOString().split('T')[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts: { toDate: () => Date } | null): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

// ─── Tab: Interns ─────────────────────────────────────────────────────────────

type InternFilter = 'all' | 'active' | 'clocked' | 'done';

function InternTab({ interns, loading, onRefresh }: {
  interns: Intern[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<InternFilter>('all');

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
        <button onClick={onRefresh} className="text-cream/40 hover:text-cream/70 text-sm transition-colors">
          Refresh
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10">
                <tr>
                  {['Name','Major','Year','School','Status','Clock','Hrs Done','Hrs Left','Start','End'].map((h) => (
                    <Th key={h}>{h}</Th>
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
                    <Td className="text-cream/60 max-w-[150px] truncate">{i.school}</Td>
                    <Td><Badge status={i.status} /></Td>
                    <Td><ClockBadge isClockedIn={i.isClockedIn} /></Td>
                    <Td className="text-cream/70">{i.completedHours}h</Td>
                    <Td className="text-cream/70">{i.remainingHours}h</Td>
                    <Td className="text-cream/50 text-xs">{fmtDate(i.startDate.toDate())}</Td>
                    <Td className="text-cream/50 text-xs">{fmtDate(i.endDate.toDate())}</Td>
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

// ─── Tab: Guests ──────────────────────────────────────────────────────────────

function GuestTab({ guests, loading, date, onDateChange }: {
  guests: Guest[];
  loading: boolean;
  date: string;
  onDateChange: (d: string) => void;
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
                    <Td className="text-cream/60 max-w-[130px] truncate">{g.organization || '—'}</Td>
                    <Td className="text-cream/60 max-w-[130px] truncate">{g.purpose}</Td>
                    <Td className="text-cream/60 max-w-[120px] truncate">{g.eventName || '—'}</Td>
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

function RecordsTab({ records, loading, date, onDateChange }: {
  records: TimeRecord[];
  loading: boolean;
  date: string;
  onDateChange: (d: string) => void;
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
                  {['Intern','Major','Time In','Time Out','Hours','Status','Min Late','Penalty','Notes'].map((h) => (
                    <Th key={h}>{h}</Th>
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
                    <Td className="text-cream/70">{r.minutesLate > 0 ? `${r.minutesLate}m` : '—'}</Td>
                    <Td className="text-cream/70">{r.penaltyHours > 0 ? `+${r.penaltyHours}h` : '—'}</Td>
                    <Td className="text-cream/40 text-xs">{r.notes || '—'}</Td>
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

// ─── Tab: Analytics ───────────────────────────────────────────────────────────

function AnalyticsTab({ analytics, hoursByMajor, nearCompletion, loading, onRefresh }: {
  analytics: InternAnalyticsSummary[];
  hoursByMajor: Record<string, number>;
  nearCompletion: Intern[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const avgAttendance = analytics.length > 0
    ? (analytics.reduce((s, a) => s + a.attendanceRate, 0) / analytics.length).toFixed(1)
    : 0;
  const avgDaily = analytics.length > 0
    ? (analytics.reduce((s, a) => s + a.averageDailyHours, 0) / analytics.length).toFixed(2)
    : 0;
  const maxHours = Math.max(...Object.values(hoursByMajor), 1);

  return (
    <div className="flex flex-col gap-6">
      {loading ? <Spinner /> : (
        <>
          {/* Overview */}
          <div className="grid grid-cols-4 gap-4">
            <Stat label="Interns Tracked"  value={analytics.length} />
            <Stat label="Avg Attendance"   value={`${avgAttendance}%`} />
            <Stat label="Avg Daily Hours"  value={`${avgDaily}h`} />
            <Stat label="Near Completion"  value={nearCompletion.length} sub="within 20h remaining" />
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Hours by major bar chart */}
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

            {/* Near completion */}
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
                  <span className="text-amber-400 text-sm font-semibold">{i.remainingHours}h left</span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-intern performance table */}
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
                      <Td className="text-cream/70">{a.completedHours}h</Td>
                      <Td className="text-cream/70">{a.remainingHours}h</Td>
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

  const [guestDate, setGuestDate]   = useState(todayStr);
  const [guests, setGuests]         = useState<Guest[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(false);

  const [recordDate, setRecordDate]     = useState(todayStr);
  const [records, setRecords]           = useState<TimeRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [analytics, setAnalytics]         = useState<InternAnalyticsSummary[]>([]);
  const [hoursByMajor, setHoursByMajor]   = useState<Record<string, number>>({});
  const [nearCompletion, setNearCompletion] = useState<Intern[]>([]);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

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

  const fetchRecords = useCallback(async (date: string) => {
    setRecordsLoading(true);
    try { setRecords(await getTimeRecordsByDate(date)); }
    finally { setRecordsLoading(false); }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const [a, hbm, nc] = await Promise.all([
        getAllInternAnalytics(),
        getHoursByMajor(),
        getInternsNearCompletion(),
      ]);
      setAnalytics(a);
      setHoursByMajor(hbm);
      setNearCompletion(nc);
      setAnalyticsLoaded(true);
    } finally { setAnalyticsLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'interns'   && !internsLoaded)   fetchInterns();
    if (tab === 'guests')                        fetchGuests(guestDate);
    if (tab === 'records')                       fetchRecords(recordDate);
    if (tab === 'analytics' && !analyticsLoaded) fetchAnalytics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleSignOut() {
    await adminSignOut();
    router.replace('/admin/login');
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'interns',   label: 'Interns' },
    { id: 'guests',    label: 'Guests' },
    { id: 'records',   label: 'Time Records' },
    { id: 'analytics', label: 'Analytics' },
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
          <InternTab interns={interns} loading={internsLoading} onRefresh={fetchInterns} />
        )}
        {tab === 'guests' && (
          <GuestTab
            guests={guests}
            loading={guestsLoading}
            date={guestDate}
            onDateChange={(d) => { setGuestDate(d); fetchGuests(d); }}
          />
        )}
        {tab === 'records' && (
          <RecordsTab
            records={records}
            loading={recordsLoading}
            date={recordDate}
            onDateChange={(d) => { setRecordDate(d); fetchRecords(d); }}
          />
        )}
        {tab === 'analytics' && (
          <AnalyticsTab
            analytics={analytics}
            hoursByMajor={hoursByMajor}
            nearCompletion={nearCompletion}
            loading={analyticsLoading}
            onRefresh={fetchAnalytics}
          />
        )}
      </div>
    </div>
  );
}
