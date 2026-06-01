import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore/lite';
import { db } from '../firebase';
import type { Event, EventCreate, EventUpdate } from './types';

const EVENTS = 'events';

// ─── Event CRUD ───────────────────────────────────────────────────────────────

export async function createEvent(data: EventCreate): Promise<string> {
  const ref = await addDoc(collection(db, EVENTS), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getEvent(id: string): Promise<Event | null> {
  const snap = await getDoc(doc(db, EVENTS, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Event;
}

export async function getAllEvents(): Promise<Event[]> {
  const snap = await getDocs(query(collection(db, EVENTS), orderBy('date', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Event);
}

export async function getEventsByStatus(status: Event['status']): Promise<Event[]> {
  const q = query(
    collection(db, EVENTS),
    where('status', '==', status),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Event);
}

export async function getEventsByDate(date: string): Promise<Event[]> {
  const q = query(collection(db, EVENTS), where('date', '==', date));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Event);
}

export async function updateEvent(id: string, data: EventUpdate): Promise<void> {
  await updateDoc(doc(db, EVENTS, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteDoc(doc(db, EVENTS, id));
}

export async function incrementEventGuestCount(id: string): Promise<void> {
  const event = await getEvent(id);
  if (!event) return;
  await updateDoc(doc(db, EVENTS, id), {
    actualGuestCount: event.actualGuestCount + 1,
    updatedAt: serverTimestamp(),
  });
}
