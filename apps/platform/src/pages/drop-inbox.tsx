// Drop Inbox — P2P drop notifications for incoming memory shares
export function DropInbox() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Drop Inbox</h2>
        <span className="rounded-full bg-indigo-600/20 px-3 py-1 text-xs font-medium text-indigo-400">
          3 pending
        </span>
      </div>

      {/* Pending Drops */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-zinc-400">Pending Drops</h3>
        {/* DropCard components — accept/reject incoming P2P memory shares */}
      </section>

      {/* Drop History */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-zinc-400">Drop History</h3>
        {/* DropHistoryList component */}
      </section>
    </div>
  );
}
