import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, runTransaction, writeBatch, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { calcEndDate } from '../utils/dates';
import { ATTENDANCE } from '../attendance-config';
import type { Intern, InternCreate, InternUpdate, TimeRecord, TimeRecordCreate } from './types';

const INTERNS = 'interns';
const TIME_RECORDS = 'timeRecords';

// ─── Intern CRUD ─────────────────────────────────────────────────────────────

export async function createIntern(data: InternCreate): Promise<string> {
  if (data.nfcUid) {
    const existing = await getInternByNfc(data.nfcUid);
    if (existing) throw new Error(`NFC UID is already assigned to ${existing.name}`);
  }
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
  if (data.nfcUid) {
    const existing = await getInternByNfc(data.nfcUid);
    if (existing && existing.id !== id) {
      throw new Error(`NFC UID is already assigned to ${existing.name}`);
    }
  }
  await updateDoc(doc(db, INTERNS, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteIntern(id: string): Promise<void> {
  await deleteDoc(doc(db, INTERNS, id));
}

// ─── Clock In / Out ──────────────────────────────────────────────────────────

export async function clockIn(internId: string, atTime?: Date): Promise<string> {
  const now = atTime ? Timestamp.fromDate(atTime) : Timestamp.now();
  const date = now.toDate().toISOString().split('T')[0];

  const {
    morningGraceHour, afternoonGraceHour, lunchBreakHour,
    penaltyBracketMinutes, penaltyHoursPerBracket,
  } = ATTENDANCE;

  const hours = now.toDate().getHours();
  const minutes = now.toDate().getMinutes();
  const inLunchBreak = hours === lunchBreakHour;

  let isLate: boolean;
  let minutesLate: number;
  if (inLunchBreak) {
    isLate = false;
    minutesLate = 0;
  } else if (hours >= afternoonGraceHour) {
    isLate = hours > afternoonGraceHour || (hours === afternoonGraceHour && minutes >= 1);
    minutesLate = isLate ? (hours - afternoonGraceHour) * 60 + minutes : 0;
  } else {
    isLate = hours > morningGraceHour || (hours === morningGraceHour && minutes >= 1);
    minutesLate = isLate ? (hours - morningGraceHour) * 60 + minutes : 0;
  }

  const lateBrackets = isLate ? Math.ceil(minutesLate / penaltyBracketMinutes) : 0;
  const penaltyHours = lateBrackets * penaltyHoursPerBracket;

  return runTransaction(db, async (tx) => {
    const internRef = doc(db, INTERNS, internId);
    const internSnap = await tx.get(internRef);
    if (!internSnap.exists()) throw new Error('Intern not found');
    const intern = { id: internSnap.id, ...internSnap.data() } as Intern;
    if (intern.isClockedIn) throw new Error('Intern is already clocked in');

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

    const recordRef = doc(collection(db, TIME_RECORDS));
    tx.set(recordRef, { ...record, createdAt: serverTimestamp() });

    const newRequiredHours = intern.requiredHours + penaltyHours;
    const startDateStr = intern.startDate.toDate().toISOString().split('T')[0];
    const newEndDate = penaltyHours > 0 ? calcEndDate(startDateStr, newRequiredHours) : null;

    tx.update(internRef, {
      isClockedIn: true,
      lastClockIn: now,
      ...(penaltyHours > 0 && {
        requiredHours: newRequiredHours,
        remainingHours: intern.remainingHours + penaltyHours,
        endDate: Timestamp.fromDate(new Date(newEndDate! + 'T00:00:00')),
      }),
      updatedAt: serverTimestamp(),
    });

    return recordRef.id;
  });
}

export async function clockOut(internId: string, atTime?: Date): Promise<void> {
  // Query for the open time record outside the transaction — Firestore transactions
  // don't support collection queries in the read set. We pass the specific doc ID
  // into the transaction so both writes are committed atomically.
  const timeOut = atTime ?? new Date();
  const openQ = query(
    collection(db, TIME_RECORDS),
    where('internId', '==', internId),
    where('timeOut', '==', null)
  );
  const openSnap = await getDocs(openQ);
  if (openSnap.empty) throw new Error('No open time record found');
  const recordDocId = openSnap.docs[0].id;

  const { endOfDayHour, lunchBreakHour, penaltyBracketMinutes, penaltyHoursPerBracket } = ATTENDANCE;

  await runTransaction(db, async (tx) => {
    const internRef = doc(db, INTERNS, internId);
    const recordRef = doc(db, TIME_RECORDS, recordDocId);

    const [internSnap, recordSnap] = await Promise.all([tx.get(internRef), tx.get(recordRef)]);
    if (!internSnap.exists()) throw new Error('Intern not found');
    if (!recordSnap.exists()) throw new Error('Time record not found');

    const intern = { id: internSnap.id, ...internSnap.data() } as Intern;
    if (!intern.isClockedIn) throw new Error('Intern is not clocked in');

    const timeIn = (recordSnap.data().timeIn as Timestamp).toDate();
    const rawHours = (timeOut.getTime() - timeIn.getTime()) / (1000 * 60 * 60);
    // Deduct the 12:00–13:00 lunch window if the session overlaps it
    const lunchStart = new Date(timeIn); lunchStart.setHours(12, 0, 0, 0);
    const lunchEnd   = new Date(timeIn); lunchEnd.setHours(13, 0, 0, 0);
    const lunchMs    = Math.max(0, Math.min(timeOut.getTime(), lunchEnd.getTime()) - Math.max(timeIn.getTime(), lunchStart.getTime()));
    const hoursRendered = rawHours - lunchMs / (1000 * 60 * 60);

    const outHour = timeOut.getHours();
    const outMinute = timeOut.getMinutes();
    const isLunchBreakOut = outHour === lunchBreakHour;

    const minutesEarlyOut = isLunchBreakOut
      ? 0
      : Math.max(0, endOfDayHour * 60 - (outHour * 60 + outMinute));
    const earlyOutBrackets = minutesEarlyOut > 0 ? Math.ceil(minutesEarlyOut / penaltyBracketMinutes) : 0;
    const earlyOutPenaltyHours = earlyOutBrackets * penaltyHoursPerBracket;
    const isEarlyOut = earlyOutPenaltyHours > 0;

    tx.update(recordRef, {
      timeOut: Timestamp.fromDate(timeOut),
      hoursRendered: Math.round(hoursRendered * 100) / 100,
      isEarlyOut,
      minutesEarlyOut,
      earlyOutPenaltyHours,
    });

    // Credit rules (work day = 8:00 AM–12:00 PM + 1:00 PM–5:00 PM, each half = 4h):
    //   Lunch break clock-out (12:xx)  → morning half done = 4h
    //   Afternoon clock-in (1PM+) + any out  → afternoon half done = 4h
    //   Morning clock-in + end-of-day out    → full day = 8h
    const clockInHour = timeIn.getHours();
    const isAfternoonSession = clockInHour >= ATTENDANCE.afternoonGraceHour;
    const hoursToCredit = (isLunchBreakOut || isAfternoonSession) ? 4 : 8;

    const newCompleted = intern.completedHours + hoursToCredit;
    const newRequiredHours = intern.requiredHours + earlyOutPenaltyHours;
    const newRemaining = Math.max(0, newRequiredHours - newCompleted);
    const startDateStr = intern.startDate.toDate().toISOString().split('T')[0];
    const newEndDate = earlyOutPenaltyHours > 0
      ? calcEndDate(startDateStr, newRequiredHours)
      : null;

    tx.update(internRef, {
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
 */
export async function recalcAllInternHours(): Promise<void> {
  const interns = await getAllInterns();
  await Promise.all(interns.map(async (intern) => {
    const records = await getTimeRecordsByIntern(intern.id);

    const completedHours = records
      .filter((r) => r.timeOut !== null)
      .reduce((sum, r) => {
        const clockInHour = r.timeIn.toDate().getHours();
        const clockOutHour = r.timeOut!.toDate().getHours();
        const isHalfDay = clockInHour >= ATTENDANCE.afternoonGraceHour || clockOutHour === ATTENDANCE.lunchBreakHour;
        return sum + (isHalfDay ? 4 : 8);
      }, 0);

    const baseHours = ATTENDANCE.baseHours[intern.major] ?? 0;
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

/** Batch-update internName across all time records when an intern is renamed */
export async function propagateInternNameUpdate(internId: string, newName: string): Promise<void> {
  const records = await getTimeRecordsByIntern(internId);
  if (records.length === 0) return;
  const batch = writeBatch(db);
  for (const r of records) {
    batch.update(doc(db, TIME_RECORDS, r.id), { internName: newName });
  }
  await batch.commit();
}

/** Recompute hours/status for a single intern from their time records */
async function recalcInternHours(internId: string): Promise<void> {
  const intern = await getIntern(internId);
  if (!intern) throw new Error('Intern not found');
  const records = await getTimeRecordsByIntern(internId);

  const completedHours = records
    .filter((r) => r.timeOut !== null)
    .reduce((sum, r) => {
      const clockInHour = r.timeIn.toDate().getHours();
      const clockOutHour = r.timeOut!.toDate().getHours();
      const isHalfDay = clockInHour >= ATTENDANCE.afternoonGraceHour || clockOutHour === ATTENDANCE.lunchBreakHour;
      return sum + (isHalfDay ? 4 : 8);
    }, 0);

  const baseHours = ATTENDANCE.baseHours[intern.major] ?? 0;
  const totalPenalties = records.reduce((s, r) => s + r.penaltyHours + (r.earlyOutPenaltyHours ?? 0), 0);
  const requiredHours = baseHours + totalPenalties;
  const remainingHours = Math.max(0, requiredHours - completedHours);

  await updateDoc(doc(db, INTERNS, internId), {
    completedHours:  Math.round(completedHours  * 100) / 100,
    requiredHours,
    remainingHours:  Math.round(remainingHours  * 100) / 100,
    status: remainingHours <= 0 ? 'done' : intern.status,
    updatedAt: serverTimestamp(),
  });
}

/** Edit a time record's timestamps; recalculates all penalty fields and intern totals */
export async function updateTimeRecord(
  recordId: string,
  internId: string,
  newTimeIn: Date,
  newTimeOut: Date | null,
  notes?: string
): Promise<void> {
  const {
    morningGraceHour, afternoonGraceHour, lunchBreakHour,
    penaltyBracketMinutes, penaltyHoursPerBracket, endOfDayHour,
  } = ATTENDANCE;

  const h = newTimeIn.getHours();
  const m = newTimeIn.getMinutes();
  const inLunch = h === lunchBreakHour;

  let isLate: boolean;
  let minutesLate: number;
  if (inLunch) {
    isLate = false; minutesLate = 0;
  } else if (h >= afternoonGraceHour) {
    isLate = h > afternoonGraceHour || (h === afternoonGraceHour && m >= 1);
    minutesLate = isLate ? (h - afternoonGraceHour) * 60 + m : 0;
  } else {
    isLate = h > morningGraceHour || (h === morningGraceHour && m >= 1);
    minutesLate = isLate ? (h - morningGraceHour) * 60 + m : 0;
  }
  const penaltyHours = isLate ? Math.ceil(minutesLate / penaltyBracketMinutes) * penaltyHoursPerBracket : 0;

  const update: Record<string, unknown> = {
    timeIn: Timestamp.fromDate(newTimeIn),
    isLate,
    minutesLate,
    penaltyHours,
    ...(notes !== undefined && { notes }),
  };

  if (newTimeOut !== null) {
    const oh = newTimeOut.getHours();
    const om = newTimeOut.getMinutes();
    const isLunchOut = oh === lunchBreakHour;
    const minsEarly = isLunchOut ? 0 : Math.max(0, endOfDayHour * 60 - (oh * 60 + om));
    const earlyOutPenaltyHours = minsEarly > 0
      ? Math.ceil(minsEarly / penaltyBracketMinutes) * penaltyHoursPerBracket
      : 0;
    update.timeOut              = Timestamp.fromDate(newTimeOut);
    const rawMs       = newTimeOut.getTime() - newTimeIn.getTime();
    const ls = new Date(newTimeIn); ls.setHours(12, 0, 0, 0);
    const le = new Date(newTimeIn); le.setHours(13, 0, 0, 0);
    const lMs = Math.max(0, Math.min(newTimeOut.getTime(), le.getTime()) - Math.max(newTimeIn.getTime(), ls.getTime()));
    update.hoursRendered        = Math.round((rawMs - lMs) / 36000) / 100;
    update.isEarlyOut           = earlyOutPenaltyHours > 0;
    update.minutesEarlyOut      = minsEarly;
    update.earlyOutPenaltyHours = earlyOutPenaltyHours;
  }

  await updateDoc(doc(db, TIME_RECORDS, recordId), update);
  await recalcInternHours(internId);
}

/** Push endDate of all non-done interns forward by any newly added closed dates */
export async function recalcAllInternEndDates(closedDates: string[]): Promise<void> {
  const interns = await getAllInterns();
  await Promise.all(
    interns
      .filter((i) => i.status !== 'done')
      .map(async (intern) => {
        const startDateStr = intern.startDate.toDate().toISOString().split('T')[0];
        const newEndDate = calcEndDate(startDateStr, intern.requiredHours, closedDates);
        if (!newEndDate) return;
        await updateDoc(doc(db, INTERNS, intern.id), {
          endDate: Timestamp.fromDate(new Date(newEndDate + 'T00:00:00')),
          updatedAt: serverTimestamp(),
        });
      })
  );
}
