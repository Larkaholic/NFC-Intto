'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { watchAuthState } from '@/lib/auth';
import type { User } from 'firebase/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // undefined = still loading, null = not logged in, User = logged in
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    return watchAuthState((u) => setUser(u));
  }, []);

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (user === undefined) return; // still loading
    if (isLoginPage && user) {
      router.replace('/admin');
    } else if (!isLoginPage && !user) {
      router.replace('/admin/login');
    }
  }, [user, isLoginPage, router]);

  // Still loading auth state
  if (user === undefined) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-emerald-400 animate-spin" />
      </div>
    );
  }

  // On the login page and not logged in — show the login form
  if (isLoginPage && !user) return <>{children}</>;

  // On a protected page and logged in — show the page
  if (!isLoginPage && user) return <>{children}</>;

  // Redirect in progress — show nothing
  return null;
}
