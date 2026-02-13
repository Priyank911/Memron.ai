// Access Control — granular R/W permissions with RFC3339 expiration
export function AccessControl() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Access Control</h2>

      {/* Active Grants */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-zinc-400">Active Grants</h3>
        {/* AccessGrantCard — grantee DID, permission (read|write|admin), expiresAt (RFC3339) */}
      </section>

      {/* Create Grant */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <h3 className="mb-4 text-sm font-medium text-zinc-400">Issue New Grant</h3>
        {/* GrantForm — DID input, permission selector, datetime picker */}
      </section>

      {/* Revoked / Expired */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-zinc-400">Revoked &amp; Expired</h3>
        {/* HistoryTable */}
      </section>
    </div>
  );
}
