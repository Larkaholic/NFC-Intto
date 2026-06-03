import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp, serverTimestamp,
} from 'firebase/firestore/lite';
import { db } from '../firebase';
import { calcEndDate } from '../utils/dates';
import type { Intern, InternCreate, InternUpdate, TimeRecord, TimeRecordCreate } from './types';

const INTERNS = 'interns';
const TIME_RECORDS = 'timeRecords';

// Base required hours per major — used by recalcAllInternHours
const MAJOR_BASE_HOURS: Record<string, number> = {
  'IT': 350,
  'MMA': 250,
  'Net Sec': 350,
  'CS': 250,
};

// ─── Intern CRUD ─────────────────────────────────────────────────────────────

export async function createIntern(data: InternCreate): Promise<string> {
  const ref = await addDoc(collection(db, INTERNS), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getIntern(id: string): Promise<Intern | null> {
  const snap = await getDoc(doc(db, INTERNS, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Intern;
}

export async function getInternByNfc(nfcUid: string): Promise<Intern | null> {
  const q = query(collection(db, INTERNS), where('nfcUid', '==', nfcUid));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Intern;
}

export async function getAllInterns(): Promise<Intern[]> {
  const snap = await getDocs(query(collection(db, INTERNS), orderBy('name')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Intern);
}

export async function getInternsByStatus(status: Intern['status']): Promise<Intern[]> {
  const q = query(collection(db, INTERNS), where('status', '==', status), orderBy('name'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Intern);
}

export async function updateIntern(id: string, data: InternUpdate): Promise<void> {
  await updateDoc(doc(db, INTERNS, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteIntern(id: string): Promise<void> {
  await deleteDoc(doc(db, INTERNS, id));
}

// ─── Clock In / Out ──────────────────────────────────────────────────────────

export async function clockIn(internId: string, atTime?: Date): Promise<string> {
  const intern = await getIntern(internId);
  if (!intern) throw new Error('Intern not found');
  if (intern.isClockedIn) throw new Error('Intern is already clocked in');

  const now = atTime ? Timestamp.fromDate(atTime) : Timestamp.now();
  const date = now.toDate().toISOString().split('T')[0];

  // Late penalty rules:
  //   Morning  (before 12:00): late after 8:01AM, minutes counted from 8:00AM
  //   Lunch    (12:00–12:59):  never penalised
  //   Afternoon (13:01+):      late after 1:01PM, minutes counted from 1:00PM
  // Each 15-min bracket (or fraction) adds +2h. e.g. 1 min late → +2h, 16 min → +4h.
  const hours = now.toDate().getHours();
  const minutes = now.toDate().getMinutes();
  const inLunchBreak = hours === 12;

  let isLate: boolean;
  let minutesLate: number;
  if (inLunchBreak) {
    isLate = false;
    minutesLate = 0;
  } else if (hours >= 13) {
    // Returning from lunch: reference time is 1:00PM
    isLate = hours > 13 || (hours === 13 && minutes >= 1);
    minutesLate = isLate ? (hours - 13) * 60 + minutes : 0;
  } else {
    // Morning: reference time is 8:00AM
    isLate = hours > 8 || (hours === 8 && minutes >= 1);
    minutesLate = isLate ? (hours - 8) * 60 + minutes : 0;
  }

  const lateBrackets = isLate ? Math.ceil(minutesLate / 15) : 0;
  const penaltyHours = lateBrackets * 2;

  const record: TimeRecordCreate = {
    internId,
    internName: intern.name,
    major: intern.major,
    date,
    timeIn: now,
    timeOut: null,
    hoursRendered: null,
    isLate,
    minutesLate,
    penaltyHours,
    isEarlyOut: false,
    minutesEarlyOut: 0,
    earlyOutPenaltyHours: 0,
    notes: '',
  };

  const ref = await addDoc(collection(db, TIME_RECORDS), {
    ...record,
    createdAt: serverTimestamp(),
  });

  const newRequiredHours = intern.requiredHours + penaltyHours;
  const startDateStr = intern.startDate.toDate().toISOString().split('T')[0];
  const newEndDate = penaltyHours > 0 ? calcEndDate(startDateStr, newRequiredHours) : null;

  await updateDoc(doc(db, INTERNS, internId), {
    isClockedIn: true,
    lastClockIn: now,
    ...(penaltyHours > 0 && {
      requiredHours: newRequiredHours,
      remainingHours: intern.remainingHours + penaltyHours,
      endDate: Timestamp.fromDate(new Date(newEndDate + 'T00:00:00')),
    }),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function clockOut(internId: string): Promise<void> {
  const intern = await getIntern(internId);
  if (!intern) throw new Error('Intern not found');
  if (!intern.isClockedIn) throw new Error('Intern is not clocked in');

  // Find the open time record for today
  const date = new Date().toISOString().split('T')[0];
  const q = query(
    collection(db, TIME_RECORDS),
    where('internId', '==', internId),
    where('date', '==', date),
    where('timeOut', '==', null)
  );
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('No open time record found');

  const recordDoc = snap.docs[0];
  const timeIn = (recordDoc.data().timeIn as Timestamp).toDate();
  const timeOut = new Date();
  const hoursRendered = (timeOut.getTime() - timeIn.getTime()) / (1000 * 60 * 60);

  const outHour = timeOut.getHours();
  const outMinute = timeOut.getMinutes();

  // Lunch break clock-out (12:00–12:59): temporary break, not end-of-day.
  const isLunchBreakOut = outHour === 12;

  // Early-out penalty: applies only to end-of-day clock-outs before 5:00PM.
  // Each 15-min bracket early = +2h penalty. e.g. 4:45PM = 15 min early = +2h.
  const minutesEarlyOut = isLunchBreakOut
    ? 0
    : Math.max(0, 17 * 60 - (outHour * 60 + outMinute));
  const earlyOutBrackets = minutesEarlyOut > 0 ? Math.ceil(minutesEarlyOut / 15) : 0;
  const earlyOutPenaltyHours = earlyOutBrackets * 2;
  const isEarlyOut = earlyOutPenaltyHours > 0;

  await updateDoc(doc(db, TIME_RECORDS, recordDoc.id), {
    timeOut: Timestamp.fromDate(timeOut),
    hoursRendered: Math.round(hoursRendered * 100) / 100,
    isEarlyOut,
    minutesEarlyOut,
    earlyOutPenaltyHours,
  });

  // Credit rules (work day = 8AM–12PM + 1PM–5PM, each half = 4h):
  //   Lunch break clock-out (12:00–12:59)  → morning half done = 4h
  //   Afternoon clock-in (1PM+) + any out  → afternoon half done = 4h
  //   Morning clock-in + end-of-day out    → full day = 8h
  const clockInHour = timeIn.getHours();
  const isAfternoonSession = clockInHour >= 13;
  const hoursToCredit = (isLunchBreakOut || isAfternoonSession) ? 4 : 8;

  const newCompleted = intern.completedHours + hoursToCredit;
  const newRequiredHours = intern.requiredHours + earlyOutPenaltyHours;
  const newRemaining = Math.max(0, newRequiredHours - newCompleted);
  const startDateStr = intern.startDate.toDate().toISOString().split('T')[0];
  const newEndDate = earlyOutPenaltyHours > 0
    ? calcEndDate(startDateStr, newRequiredHours)
    : null;

  await updateDoc(doc(db, INTERNS, internId), {
    isClockedIn: false,
    completedHours: Math.round(newCompleted * 100) / 100,
    ...(earlyOutPenaltyHours > 0 && {
      requiredHours: Math.round(newRequiredHours * 100) / 100,
      endDate: Timestamp.fromDate(new Date(newEndDate! + 'T00:00:00')),
    }),
    remainingHours: Math.round(newRemaining * 100) / 100,
    status: newRemaining <= 0 ? 'done' : intern.status,
    updatedAt: serverTimestamp(),
  });
}

// ─── Time Records ─────────────────────────────────────────────────────────────

export async function getTimeRecordsByIntern(internId: string): Promise<TimeRecord[]> {
  const q = query(
    collection(db, TIME_RECORDS),
    where('internId', '==', internId),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TimeRecord);
}

export async function getTimeRecordsByDate(date: string): Promise<TimeRecord[]> {
  const q = query(
    collection(db, TIME_RECORDS),
    where('date', '==', date),
    orderBy('timeIn', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TimeRecord);
}

export async function getAllTimeRecords(): Promise<TimeRecord[]> {
  const q = query(collection(db, TIME_RECORDS), orderBy('date', 'asc'), orderBy('timeIn', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TimeRecord);
}

export async function updateTimeRecordNotes(recordId: string, notes: string): Promise<void> {
  await updateDoc(doc(db, TIME_RECORDS, recordId), { notes });
}

// ─── Recalculate Hours ────────────────────────────────────────────────────────

/**
 * Recomputes completedHours, requiredHours, and remainingHours for every intern
 * from their actual time records. Run this once to fix corrupted stored values.
 *
 * Rules:
 *  - Each day with a completed clock-out (timeOut != null) = 8h completed
 *  - requiredHours = major base hours + sum of penaltyHours from all records
 *  - Absent days (no time record) count as 0h
 */
export async function recalcAllInternHours(): Promise<void> {
  const interns = await getAllInterns();
  await Promise.all(interns.map(async (intern) => {
    const records = await getTimeRecordsByIntern(intern.id);

    // Sum hours per completed record: 4h for half-day sessions, 8h for full-day sessions.
    // Half-day: afternoon clock-in (1PM+) OR lunch-break clock-out (12:xx).
    const completedHours = records
      .filter((r) => r.timeOut !== null)
      .reduce((sum, r) => {
        const clockInHour = r.timeIn.toDate().getHours();
        const clockOutHour = r.timeOut!.toDate().getHours();
        const isHalfDay = clockInHour >= 13 || clockOutHour === 12;
        return sum + (isHalfDay ? 4 : 8);
      }, 0);

    // Derive required hours from major base + actual penalties on record
    const baseHours = MAJOR_BASE_HOURS[intern.major] ?? 0;
    const totalPenalties = records.reduce(
      (s, r) => s + r.penaltyHours + (r.earlyOutPenaltyHours ?? 0), 0
    );
    const requiredHours = baseHours + totalPenalties;

    const remainingHours = Math.max(0, requiredHours - completedHours);

    await updateDoc(doc(db, INTERNS, intern.id), {
      requiredHours,
      completedHours,
      remainingHours,
      status: remainingHours <= 0 ? 'done' : intern.status,
      updatedAt: serverTimestamp(),
    });
  }));
}
