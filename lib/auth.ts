import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

export async function adminSignIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function adminSignOut(): Promise<void> {
  await fbSignOut(auth);
}

export function watchAuthState(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}
