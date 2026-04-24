'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './layout';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? '/dashboard' : '/login');
    }
  }, [user, loading, router]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0A0B' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, fontFamily: 'sans-serif', color: '#C9A84C' }}>MUNDIAL 2026</div>
        <div style={{ color: '#5A5750', marginTop: 8 }}>Cargando...</div>
      </div>
    </div>
  );
}
