// Settings — identity, preferences, key management
export function Settings() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h3 className="mb-4 text-sm font-medium text-zinc-400">Identity (DID)</h3>
        {/* DID display, export, rotate keys */}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h3 className="mb-4 text-sm font-medium text-zinc-400">IPFS Configuration</h3>
        {/* Gateway selector, pinning settings */}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h3 className="mb-4 text-sm font-medium text-zinc-400">Lit Protocol Keys</h3>
        {/* Encryption key management, session signatures */}
      </section>
    </div>
  );
}
