import { collection, doc, getDocs, addDoc, deleteDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const CLOSED_DAYS = 'closedDays';

export interface ClosedDay {
  id: string;
  date: string; // YYYY-MM-DD
  reason: string;
}

export async function getClosedDays(): Promise<ClosedDay[]> {
  const snap = await getDocs(query(collection(db, CLOSED_DAYS), orderBy('date', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, date: d.data().date as string, reason: d.data().reason as string }));
}

export async function addClosedDay(date: string, reason: string): Promise<string> {
  const ref = await addDoc(collection(db, CLOSED_DAYS), { date, reason, createdAt: serverTimestamp() });
  return ref.id;
}

export async function removeClosedDay(id: string): Promise<void> {
  await deleteDoc(doc(db, CLOSED_DAYS, id));
}
