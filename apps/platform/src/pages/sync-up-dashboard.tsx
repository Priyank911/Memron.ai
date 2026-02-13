// Sync-Up Dashboard — real-time view of active memory tunnels & sync state
export function SyncUpDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Sync-Up Dashboard</h2>
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 transition">
          + New Tunnel
        </button>
      </div>

      {/* Active Tunnels */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-zinc-400">Active Memory Tunnels</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* TunnelCard components */}
        </div>
      </section>

      {/* Compression Stats */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h3 className="mb-2 text-sm font-medium text-zinc-400">Token Compression</h3>
        <p className="text-4xl font-bold text-indigo-400">92.3%</p>
        <p className="text-sm text-zinc-500">Average across active tunnels</p>
      </section>

      {/* Recent Syncs */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-zinc-400">Recent Sync Activity</h3>
        {/* SyncActivityFeed component */}
      </section>
    </div>
  );
}
