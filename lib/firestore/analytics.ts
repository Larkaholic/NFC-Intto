import {
  collection, getDocs, query, where, orderBy, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { isPhHoliday } from '../utils/dates';
import type {
  Intern, TimeRecord, Guest,
  InternAnalyticsSummary, GuestAnalyticsSummary, Gender,
} from './types';

const INTERNS = 'interns';
const TIME_RECORDS = 'timeRecords';
const GUESTS = 'guests';

// ─── Intern Analytics ─────────────────────────────────────────────────────────

export async function getInternAnalyticsSummary(internId: string): Promise<InternAnalyticsSummary | null> {
  const internSnap = await getDocs(
    query(collection(db, INTERNS), where('__name__', '==', internId))
  );
  if (internSnap.empty) return null;
  const intern = { id: internSnap.docs[0].id, ...internSnap.docs[0].data() } as Intern;

  const records = await getInternTimeRecords(internId);
  const completedRecords = records.filter((r) => r.hoursRendered !== null);

  const totalDaysPresent = completedRecords.length;
  const totalDaysLate = completedRecords.filter((r) => r.isLate).length;
  const averageDailyHours =
    totalDaysPresent > 0
      ? completedRecords.reduce((sum, r) => sum + (r.hoursRendered ?? 0), 0) / totalDaysPresent
      : 0;

  // Attendance rate: days present out of working days since start
  const start = intern.startDate.toDate();
  const now = new Date();
  const workingDaysSinceStart = countWorkingDays(start, now);
  const attendanceRate =
    workingDaysSinceStart > 0
      ? Math.min(100, (totalDaysPresent / workingDaysSinceStart) * 100)
      : 0;

  return {
    internId: intern.id,
    internName: intern.name,
    major: intern.major,
    totalDaysPresent,
    totalDaysLate,
    completedHours: intern.completedHours,
    remainingHours: intern.remainingHours,
    attendanceRate: Math.round(attendanceRate * 10) / 10,
    averageDailyHours: Math.round(averageDailyHours * 100) / 100,
    status: intern.status,
  };
}

export async function getAllInternAnalytics(): Promise<InternAnalyticsSummary[]> {
  const internsSnap = await getDocs(query(collection(db, INTERNS), orderBy('name')));
  const results = await Promise.all(
    internsSnap.docs.map((d) => getInternAnalyticsSummary(d.id))
  );
  return results.filter(Boolean) as InternAnalyticsSummary[];
}

/** Hours rendered per major */
export async function getHoursByMajor(): Promise<Record<string, number>> {
  const internsSnap = await getDocs(collection(db, INTERNS));
  const byMajor: Record<string, number> = {};
  for (const d of internsSnap.docs) {
    const intern = d.data() as Omit<Intern, 'id'>;
    byMajor[intern.major] = (byMajor[intern.major] ?? 0) + intern.completedHours;
  }
  return byMajor;
}

/** Interns within N hours of completing their required hours */
export async function getInternsNearCompletion(withinHours = 20): Promise<Intern[]> {
  const snap = await getDocs(
    query(collection(db, INTERNS), where('status', '==', 'active'))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Intern)
    .filter((i) => i.remainingHours <= withinHours);
}

/** Daily attendance count for a given date range */
export async function getDailyAttendance(
  from: Date,
  to: Date
): Promise<{ date: string; count: number; lateCount: number }[]> {
  const q = query(
    collection(db, TIME_RECORDS),
    where('date', '>=', from.toISOString().split('T')[0]),
    where('date', '<=', to.toISOString().split('T')[0]),
    orderBy('date', 'asc')
  );
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => d.data() as TimeRecord);

  const map: Record<string, { count: number; lateCount: number }> = {};
  for (const r of records) {
    if (!map[r.date]) map[r.date] = { count: 0, lateCount: 0 };
    map[r.date].count++;
    if (r.isLate) map[r.date].lateCount++;
  }

  return Object.entries(map).map(([date, v]) => ({ date, ...v }));
}

// ─── Guest Analytics ──────────────────────────────────────────────────────────

export async function getGuestAnalyticsSummary(
  from?: Date,
  to?: Date
): Promise<GuestAnalyticsSummary> {
  let q = query(collection(db, GUESTS), orderBy('checkInTime', 'asc'));
  if (from) {
    q = query(q, where('checkInTime', '>=', Timestamp.fromDate(from)));
  }
  if (to) {
    q = query(q, where('checkInTime', '<=', Timestamp.fromDate(to)));
  }

  const snap = await getDocs(q);
  const guests = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Guest);

  const genderBreakdown: Record<Gender, number> = {
    Male: 0, Female: 0, Other: 0, 'Prefer not to say': 0,
  };
  const ageGroups: Record<string, number> = {};
  const purposeMap: Record<string, number> = {};
  const eventMap: Record<string, number> = {};
  const monthMap: Record<string, number> = {};
  const orgs = new Set<string>();
  let totalDuration = 0;
  let durationCount = 0;

  for (const g of guests) {
    genderBreakdown[g.gender] = (genderBreakdown[g.gender] ?? 0) + 1;

    const group = ageGroup(g.age);
    ageGroups[group] = (ageGroups[group] ?? 0) + 1;

    purposeMap[g.purpose] = (purposeMap[g.purpose] ?? 0) + 1;

    const eventKey = g.eventName || 'Walk-in';
    eventMap[eventKey] = (eventMap[eventKey] ?? 0) + 1;

    const month = g.checkInTime.toDate().toLocaleString('default', { month: 'short', year: 'numeric' });
    monthMap[month] = (monthMap[month] ?? 0) + 1;

    if (g.organization) orgs.add(g.organization);

    if (g.hoursVisited !== null) {
      totalDuration += g.hoursVisited;
      durationCount++;
    }
  }

  return {
    totalGuests: guests.length,
    uniqueOrganizations: orgs.size,
    averageVisitDuration: durationCount > 0
      ? Math.round((totalDuration / durationCount) * 100) / 100
      : 0,
    genderBreakdown,
    ageGroupBreakdown: ageGroups,
    topPurposes: Object.entries(purposeMap)
      .map(([purpose, count]) => ({ purpose, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    guestsByEvent: Object.entries(eventMap)
      .map(([eventName, count]) => ({ eventName, count }))
      .sort((a, b) => b.count - a.count),
    monthlyTrend: Object.entries(monthMap).map(([month, count]) => ({ month, count })),
  };
}

/** Peak check-in hours (0-23) for a given date range */
export async function getPeakCheckInHours(from?: Date, to?: Date): Promise<{ hour: number; count: number }[]> {
  let q = query(collection(db, GUESTS), orderBy('checkInTime', 'asc'));
  if (from) q = query(q, where('checkInTime', '>=', Timestamp.fromDate(from)));
  if (to) q = query(q, where('checkInTime', '<=', Timestamp.fromDate(to)));

  const snap = await getDocs(q);
  const hourMap: Record<number, number> = {};

  for (const d of snap.docs) {
    const guest = d.data() as Guest;
    const hour = guest.checkInTime.toDate().getHours();
    hourMap[hour] = (hourMap[hour] ?? 0) + 1;
  }

  return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourMap[h] ?? 0 }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getInternTimeRecords(internId: string): Promise<TimeRecord[]> {
  const q = query(
    collection(db, TIME_RECORDS),
    where('internId', '==', internId),
    orderBy('date', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TimeRecord);
}

function ageGroup(age: number): string {
  if (age < 18) return 'Under 18';
  if (age <= 25) return '18–25';
  if (age <= 35) return '26–35';
  if (age <= 45) return '36–45';
  if (age <= 60) return '46–60';
  return '60+';
}

// Mon–Sat, excluding Philippine holidays — mirrors calcEndDate in utils/dates.ts
function countWorkingDays(from: Date, to: Date): number {
  let count = 0;
  const cur = new Date(from);
  while (cur <= to) {
    if (cur.getDay() !== 0 && !isPhHoliday(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
