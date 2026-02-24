'use client';

import { useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useUserSync } from '@/lib/hooks/use-user-sync';

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

  // Sync user data to PostgreSQL + Firebase on every login
  useUserSync();


  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
          <p className="text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Image
                src="/logo_w.png"
                alt="Memron"
                width={32}
                height={32}
                className="h-8 w-auto"
              />
              <span className="text-xl font-bold text-white">Memron</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                {user?.imageUrl && (
                  <Image
                    src={user.imageUrl}
                    alt={user.fullName || user.firstName || 'User'}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                )}
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-white">
                    {user?.fullName || user?.firstName || user?.emailAddresses[0]?.emailAddress}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {user?.emailAddresses[0]?.emailAddress}
                  </p>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Welcome Section */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-3">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ''}! 👋
          </h1>
          <p className="text-zinc-400 text-lg">
            Your AI memory infrastructure dashboard
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-500/10 rounded-lg">
                <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-zinc-400 text-sm font-medium">Total Memories</h3>
            </div>
            <p className="text-3xl font-bold text-white">0</p>
            <p className="text-xs text-zinc-500 mt-1">No memories stored yet</p>
          </div>

          <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-zinc-400 text-sm font-medium">API Calls</h3>
            </div>
            <p className="text-3xl font-bold text-white">0</p>
            <p className="text-xs text-zinc-500 mt-1">This month</p>
          </div>

          <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-zinc-400 text-sm font-medium">Avg Response</h3>
            </div>
            <p className="text-3xl font-bold text-white">--</p>
            <p className="text-xs text-zinc-500 mt-1">milliseconds</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-xl p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Quick Actions</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button className="flex items-start gap-4 p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-all text-left group">
              <div className="p-3 bg-indigo-500/10 rounded-lg group-hover:bg-indigo-500/20 transition-colors">
                <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Create Memory</h3>
                <p className="text-sm text-zinc-400">Start storing AI memories</p>
              </div>
            </button>

            <button className="flex items-start gap-4 p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-all text-left group">
              <div className="p-3 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Generate API Key</h3>
                <p className="text-sm text-zinc-400">Get your API credentials</p>
              </div>
            </button>

            <button className="flex items-start gap-4 p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-all text-left group">
              <div className="p-3 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">View Documentation</h3>
                <p className="text-sm text-zinc-400">Learn how to integrate</p>
              </div>
            </button>

            <button className="flex items-start gap-4 p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-all text-left group">
              <div className="p-3 bg-amber-500/10 rounded-lg group-hover:bg-amber-500/20 transition-colors">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Settings</h3>
                <p className="text-sm text-zinc-400">Configure your account</p>
              </div>
            </button>
          </div>
        </div>

        {/* Getting Started */}
        <div className="mt-8 bg-linear-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-2">Getting Started</h3>
              <p className="text-zinc-300 text-sm mb-4">
                Welcome to Memron! Your AI memory infrastructure is ready. Generate an API key and start building intelligent agents with persistent memory.
              </p>
              <a
                href="#"
                className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                Read the quickstart guide
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
