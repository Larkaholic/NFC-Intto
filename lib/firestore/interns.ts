import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp, serverTimestamp,
} from 'firebase/firestore/lite';
import { db } from '../firebase';
import type { Intern, InternCreate, InternUpdate, TimeRecord, TimeRecordCreate } from './types';

const INTERNS = 'interns';
const TIME_RECORDS = 'timeRecords';

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

  // Late after 8:00 AM (8:01 = 1 min late = +2h penalty per minute)
  const hours = now.toDate().getHours();
  const minutes = now.toDate().getMinutes();
  const isLate = hours > 8 || (hours === 8 && minutes >= 1);
  const minutesLate = isLate ? (hours - 8) * 60 + minutes : 0;
  const penaltyHours = minutesLate * 2;

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

  await updateDoc(doc(db, INTERNS, internId), {
    isClockedIn: true,
    lastClockIn: now,
    ...(penaltyHours > 0 && {
      requiredHours: intern.requiredHours + penaltyHours,
      remainingHours: intern.remainingHours + penaltyHours,
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

  const newCompleted = intern.completedHours + hoursRendered;
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

export async function updateTimeRecordNotes(recordId: string, notes: string): Promise<void> {
  await updateDoc(doc(db, TIME_RECORDS, recordId), { notes });
}
