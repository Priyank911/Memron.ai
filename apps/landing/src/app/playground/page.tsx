'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Playground } from '../dashboard/_components/playground';
import '../dashboard/dashboard.css';

/* ── Page ── */
interface Bucket {
  id: string;
  name: string;
  slug: string;
  memoryCount: number;
}

export default function PlaygroundPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [totalMemories, setTotalMemories] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const opts: RequestInit = { credentials: 'include' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const fetchOpts = { ...opts, signal: controller.signal };

    // Fire both independently — neither blocks the other
    const bucketsP = fetch('/api/dashboard/buckets', fetchOpts)
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setBuckets(data.buckets || []);
        }
      })
      .catch(() => { /* buckets unavailable — playground still works */ });

    const statsP = fetch('/api/dashboard/stats?range=30d', fetchOpts)
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setTotalMemories(data.totalMemories || 0);
          setTotalTokens(data.totalTokens || 0);
        }
      })
      .catch(() => { /* stats unavailable — playground still works */ });

    await Promise.allSettled([bucketsP, statsP]);
    clearTimeout(timeout);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isLoaded) fetchData();
  }, [isLoaded, fetchData]);

  if (!isLoaded || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#000' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#555' }} />
      </div>
    );
  }

  return (
    <Playground
      buckets={buckets}
      totalMemories={totalMemories}
      totalTokens={totalTokens}
      userName={user?.firstName || 'there'}
      onBack={() => router.push('/dashboard')}
    />
  );
}
