export function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
      <h1 className="text-sm font-medium text-zinc-400">Dashboard</h1>
      <div className="flex items-center gap-4">
        <span className="text-xs text-zinc-500">Connected: did:ethr:0x...abcd</span>
        <div className="h-8 w-8 rounded-full bg-indigo-600" />
      </div>
    </header>
  );
}
