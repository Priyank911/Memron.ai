// Connect Wallet — entry point for wallet-based DID authentication
export function ConnectWallet() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-indigo-600" />
        <h1 className="text-2xl font-bold">Connect to Memron</h1>
        <p className="text-sm text-zinc-400">
          Connect your wallet to generate a Decentralized Identifier (DID) and access your sovereign memory.
        </p>
        <button className="w-full rounded-lg bg-indigo-600 py-3 font-semibold hover:bg-indigo-500 transition">
          Connect Wallet
        </button>
        <p className="text-xs text-zinc-600">
          Your DID is derived from your wallet. No email or password required.
        </p>
      </div>
    </div>
  );
}
