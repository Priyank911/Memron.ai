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
    try {
      const opts: RequestInit = { credentials: 'include' };
      const [bucketsRes, statsRes] = await Promise.all([
        fetch('/api/dashboard/buckets', opts),
        fetch('/api/dashboard/stats?range=30d', opts),
      ]);

      if (bucketsRes.ok) {
        const data = await bucketsRes.json();
        setBuckets(data.buckets || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setTotalMemories(data.totalMemories || 0);
        setTotalTokens(data.totalTokens || 0);
      }
    } catch {
      // Silently handle — playground still works
    } finally {
      setLoading(false);
    }
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
