// Settings — identity, preferences, key management
export function Settings() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h3 className="mb-4 text-sm font-medium text-zinc-400">Identity</h3>
        {/* Identity display, export, manage keys */}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h3 className="mb-4 text-sm font-medium text-zinc-400">Storage Configuration</h3>
        {/* Storage backend settings */}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h3 className="mb-4 text-sm font-medium text-zinc-400">Encryption Keys</h3>
        {/* Encryption key management */}
      </section>
    </div>
  );
}
