import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const STAFF = 'staff';

export interface StaffMember {
  id: string;
  name: string;
  nfcUid: string;
}

export async function getStaffByNfc(nfcUid: string): Promise<StaffMember | null> {
  const q = query(collection(db, STAFF), where('nfcUid', '==', nfcUid));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as StaffMember;
}
