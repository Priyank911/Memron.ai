// Memory Explorer — bucketed partitions, search, context slice preview
export function MemoryExplorer() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Memory Explorer</h2>

      {/* Search & Filter */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search memories by topic, CID, or agent..."
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm"
        />
        <select className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm">
          <option>All Buckets</option>
          <option>Conversation</option>
          <option>Tool Results</option>
          <option>Preferences</option>
          <option>Knowledge</option>
        </select>
      </div>

      {/* Bucketed Partitions Grid */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-zinc-400">Memory Buckets</h3>
        {/* BucketCard components — thematic partitions */}
      </section>

      {/* Context Slice Preview */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h3 className="mb-2 text-sm font-medium text-zinc-400">Context Slice Preview</h3>
        <p className="text-xs text-zinc-500">Select a memory to preview the exact context slice injected into the inference window.</p>
      </section>
    </div>
  );
}
