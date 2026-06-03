import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Guest, GuestCreate, GuestUpdate } from './types';

const GUESTS = 'guests';

// ─── Guest CRUD ───────────────────────────────────────────────────────────────

export async function createGuest(data: GuestCreate): Promise<string> {
  const ref = await addDoc(collection(db, GUESTS), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getGuest(id: string): Promise<Guest | null> {
  const snap = await getDoc(doc(db, GUESTS, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Guest;
}

export async function getAllGuests(): Promise<Guest[]> {
  const snap = await getDocs(query(collection(db, GUESTS), orderBy('checkInTime', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Guest);
}

export async function getGuestsByEvent(eventId: string): Promise<Guest[]> {
  const q = query(
    collection(db, GUESTS),
    where('eventId', '==', eventId),
    orderBy('checkInTime', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Guest);
}

export async function getGuestsByDate(date: string): Promise<Guest[]> {
  // date = YYYY-MM-DD
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59`);
  const q = query(
    collection(db, GUESTS),
    where('checkInTime', '>=', Timestamp.fromDate(start)),
    where('checkInTime', '<=', Timestamp.fromDate(end)),
    orderBy('checkInTime', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Guest);
}

export async function updateGuest(id: string, data: GuestUpdate): Promise<void> {
  await updateDoc(doc(db, GUESTS, id), data);
}

// ─── Check-In / Check-Out ─────────────────────────────────────────────────────

export async function checkInGuest(data: Omit<GuestCreate, 'checkInTime' | 'checkOutTime' | 'hoursVisited'>): Promise<string> {
  return createGuest({
    ...data,
    checkInTime: Timestamp.now(),
    checkOutTime: null,
    hoursVisited: null,
  });
}

export async function checkOutGuest(guestId: string): Promise<void> {
  const guest = await getGuest(guestId);
  if (!guest) throw new Error('Guest not found');
  if (guest.checkOutTime) throw new Error('Guest already checked out');

  const checkOut = Timestamp.now();
  const checkIn = guest.checkInTime.toDate();
  const hoursVisited =
    (checkOut.toDate().getTime() - checkIn.getTime()) / (1000 * 60 * 60);

  await updateDoc(doc(db, GUESTS, guestId), {
    checkOutTime: checkOut,
    hoursVisited: Math.round(hoursVisited * 100) / 100,
  });
}

// ─── Currently Checked-In Guests ─────────────────────────────────────────────

export async function getCheckedInGuests(): Promise<Guest[]> {
  const q = query(
    collection(db, GUESTS),
    where('checkOutTime', '==', null),
    orderBy('checkInTime', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Guest);
}
