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

  // 8:00 = on time; 8:01+ = late. Each 15-min bracket (or fraction) adds +2h penalty.
  // Brackets: 8:01–8:15 → +2h, 8:16–8:30 → +4h, 8:31–8:45 → +6h, etc.
  const hours = now.toDate().getHours();
  const minutes = now.toDate().getMinutes();
  const isLate = hours > 8 || (hours === 8 && minutes >= 1);
  const minutesLate = isLate ? (hours - 8) * 60 + minutes : 0;
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

  await updateDoc(doc(db, TIME_RECORDS, recordDoc.id), {
    timeOut: Timestamp.fromDate(timeOut),
    hoursRendered: Math.round(hoursRendered * 100) / 100,
  });

  // Each present day (with a completed clock-out) counts as exactly 8h
  const newCompleted = intern.completedHours + 8;
  const newRemaining = Math.max(0, intern.requiredHours - newCompleted);

  await updateDoc(doc(db, INTERNS, internId), {
    isClockedIn: false,
    completedHours: Math.round(newCompleted * 100) / 100,
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

    // Distinct dates where the intern actually clocked out
    const completedDates = new Set(
      records.filter((r) => r.timeOut !== null).map((r) => r.date)
    );
    const completedHours = completedDates.size * 8;

    // Derive required hours from major base + actual penalties on record
    const baseHours = MAJOR_BASE_HOURS[intern.major] ?? 0;
    const totalPenalties = records.reduce((s, r) => s + r.penaltyHours, 0);
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
