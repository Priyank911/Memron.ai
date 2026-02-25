'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useState, useEffect } from 'react';

// ─── Steps ───────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Create workspace', sub: 'Set up your org' },
  { id: 2, label: 'Get API key',      sub: 'Authenticate agents' },
  { id: 3, label: 'All set',          sub: 'Start building' },
];

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ic = {
  Check: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,
  Copy: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
  Arrow: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>,
  Eye: ({ on }: { on: boolean }) => on
    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>,
};

function Spin({ sz = 15 }: { sz?: number }) {
  return (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" style={{ animation: 'onbSpin .7s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".2"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Terminal Panel ───────────────────────────────────────────────────────────
function Terminal({ apiKey }: { apiKey: string }) {
  const lines = [
    { t: 'comment', v: '# ── .env ──────────────────────────────────────' },
    { t: 'blank',   v: '' },
    { t: 'key',     v: `MEMRON_API_KEY="${apiKey}"` },
    { t: 'blank',   v: '' },
    { t: 'comment', v: '# ── Usage ─────────────────────────────────────' },
    { t: 'blank',   v: '' },
    { t: 'import',  v: 'import { Memron } from "@memron/sdk";' },
    { t: 'blank',   v: '' },
    { t: 'code',    v: 'const client = new Memron({' },
    { t: 'prop',    v: '  apiKey: process.env.MEMRON_API_KEY,' },
    { t: 'code',    v: '});' },
    { t: 'blank',   v: '' },
    { t: 'code',    v: 'await client.add({' },
    { t: 'prop',    v: '  content: "User prefers dark mode",' },
    { t: 'prop',    v: '  userId:  "user_123",' },
    { t: 'code',    v: '});' },
  ];
  const color: Record<string, string> = {
    comment: '#52525b',
    blank: 'transparent',
    key: '#a5b4fc',
    import: '#c4b5fd',
    code: '#e4e4e7',
    prop: '#94a3b8',
  };
  return (
    <div style={T.termWrap}>
      <div style={T.termBar}>
        <span style={T.termDot} /><span style={{ ...T.termDot, background: '#febc2e' }} /><span style={{ ...T.termDot, background: '#27c93f' }} />
        <span style={T.termTitle}>~ memron</span>
      </div>
      <div style={T.termBody}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, minHeight: l.t === 'blank' ? 8 : 'auto' }}>
            {l.t !== 'blank' && <span style={T.termLineNum}>{String(i + 1).padStart(2, ' ')}</span>}
            {l.t !== 'blank' && <span style={{ ...T.termLine, color: color[l.t] }}>{l.v}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const [step,        setStep]        = useState(1);
  const [anim,        setAnim]        = useState(false);
  const [error,       setError]       = useState('');
  const [busy,        setBusy]        = useState(false);
  const [checking,    setChecking]    = useState(true);  // true while initial DB status check runs

  // step 1
  const [orgName,     setOrgName]     = useState('');
  const [orgDesc,     setOrgDesc]     = useState('');
  const [org,         setOrg]         = useState<{ id:string; name:string; slug:string }|null>(null);

  // step 2
  const [apiKey,      setApiKey]      = useState<{ fullKey:string; prefix:string }|null>(null);
  const [showKey,     setShowKey]     = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [confirmed,   setConfirmed]   = useState(false);
  // true when a key was previously generated (can't show full key again)
  const [keyAlreadyGenerated, setKeyAlreadyGenerated] = useState(false);
  const [existingKeyPrefix,   setExistingKeyPrefix]   = useState('');

  useEffect(() => {
    if (user?.fullName && !orgName) setOrgName(`${user.fullName}'s Workspace`);
  }, [user]);

  useEffect(() => {
    if (!isLoaded || !user) return;

    const runCheck = async () => {
      setChecking(true);
      try {
        // First ensure the user exists in our DB (covers brand-new registrations
        // where the background sync hasn't fired yet)
        const syncRes = await fetch('/api/user/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        // Ignore sync errors — if user already exists it's a no-op upsert

        // Now check onboarding status
        const r = await fetch('/api/onboarding', { credentials: 'include' });
        if (!r.ok) { setChecking(false); return; }
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('application/json')) { setChecking(false); return; }
        const d = await r.json();
        if (d.isOnboarded) {
          // Already done — middleware cookie healed via server Set-Cookie header
          router.replace('/dashboard');
          return;
        }
        if (d.hasOrganization && d.organization) {
          setOrg(d.organization);
          // Restore key state if key was already generated in a previous session
          if (d.hasApiKey && d.apiKey) {
            setKeyAlreadyGenerated(true);
            setExistingKeyPrefix(d.apiKey.prefix);
          }
          setStep(2);
        }
      } catch {
        // Network error — let user proceed; API calls will surface errors per-step
      } finally {
        setChecking(false);
      }
    };

    runCheck();
  }, [isLoaded, user]);

  const go = (n: number) => {
    setAnim(true);
    setTimeout(() => { setStep(n); setAnim(false); setError(''); }, 180);
  };

  // step 1
  const createOrg = async () => {
    if (!orgName.trim() || orgName.trim().length < 2) { setError('At least 2 characters required'); return; }
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'create-organization', data: { orgName: orgName.trim(), orgDescription: orgDesc.trim() } }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setOrg(d.organization); go(2);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  // step 2
  const genKey = async () => {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'generate-api-key', data: { keyName: 'Default API Key' } }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      if (d.alreadyExists) {
        // Key was generated in a previous session — full key is gone, show recovery UI
        setKeyAlreadyGenerated(true);
        setExistingKeyPrefix(d.apiKey.prefix);
      } else {
        setApiKey(d.apiKey); setShowKey(true);
      }
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    if (!apiKey?.fullKey) return;
    await navigator.clipboard.writeText(apiKey.fullKey);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  // step 3 / complete
  const finish = async () => {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'complete', data: {} }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      router.replace('/dashboard');
    } catch (e: any) { setError(e.message); setBusy(false); }
  };

  if (!isLoaded || checking) {
    return (
      <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Spin sz={24} />
        <span style={{ fontSize: '0.78rem', color: '#3f3f46', fontFamily: "'Inter',sans-serif" }}>
          {checking ? 'Setting up your account…' : 'Loading…'}
        </span>
      </div>
    );
  }

  // for step 2 after key: expand content width to fit side-by-side
  const isWide = step === 2 && !!apiKey;

  return (
    <div style={S.root}>
      {/* Grid */}
      <div style={S.grid} />
      {/* Glow blob */}
      <div style={S.glow} />

      <div style={S.layout}>

        {/* ══ SIDEBAR ══════════════════════════════════════════════════════ */}
        <aside style={S.sidebar}>

          {/* Logo */}
          <div style={S.logoRow}>
            <Image src="/logo_w.png" alt="Memron" width={26} height={26} style={{ objectFit: 'contain', flexShrink: 0 }} />
            <span style={S.logoTxt}>Memron</span>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: 44 }}>
            <p style={S.hl1}>Your AI memory,</p>
            <p style={S.hl2}>ready in minutes.</p>
          </div>

          {/* Step nav */}
          <nav style={{ flex: 1 }}>
            {STEPS.map((s, i) => {
              const done   = step > s.id;
              const active = step === s.id;
              return (
                <div key={s.id} style={S.sRow}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ ...S.sDot, ...(active ? S.sDotA : done ? S.sDotD : {}) }}>
                      {done ? <Ic.Check /> : <span style={{ fontSize: 11, fontWeight: 700 }}>{s.id}</span>}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div style={{ ...S.sLine, ...(done ? S.sLineD : {}) }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 3, paddingBottom: 32 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: active ? '#fff' : done ? '#52525b' : '#3f3f46' }}>{s.label}</span>
                    <span style={{ fontSize: '0.68rem', color: '#27272a' }}>{s.sub}</span>
                  </div>
                </div>
              );
            })}
          </nav>

          {/* User chip */}
          <div style={S.chip}>
            {user?.imageUrl && (
              <img src={user.imageUrl} alt="" style={S.avatar} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={S.chipName}>{user?.fullName || user?.firstName || 'Welcome'}</p>
              <p style={S.chipEmail}>{user?.emailAddresses[0]?.emailAddress}</p>
            </div>
          </div>
        </aside>

        {/* ══ MAIN ═════════════════════════════════════════════════════════ */}
        <main style={S.main}>
          <div style={{
            ...S.content,
            maxWidth: isWide ? 940 : 520,
            opacity: anim ? 0 : 1,
            transform: anim ? 'translateY(8px)' : 'none',
            transition: 'opacity 0.18s, transform 0.18s, max-width 0.3s',
          }}>

            {/* Error */}
            {error && (
              <div style={S.errBox}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                {error}
              </div>
            )}

            {/* ────── STEP 1 ────── */}
            {step === 1 && (
              <div>
                <p style={S.stepBadge}>Step 1 of 3</p>
                <h1 style={S.h1}>Create your workspace</h1>
                <p style={S.desc}>Your organization holds all memories, API keys, and team members.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 28 }}>
                  {/* Org name */}
                  <div>
                    <label style={S.lbl}>Organization name</label>
                    <input
                      type="text"
                      value={orgName}
                      onChange={e => { setOrgName(e.target.value); setError(''); }}
                      onKeyDown={e => e.key === 'Enter' && createOrg()}
                      placeholder="Acme Inc."
                      autoFocus
                      style={S.inp}
                      onFocus={e => Object.assign(e.currentTarget.style, S.inpF)}
                      onBlur={e => Object.assign(e.currentTarget.style, { border: S.inp.border, boxShadow: 'none' })}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label style={S.lbl}>
                      Description
                      <span style={S.optional}>optional</span>
                    </label>
                    <textarea
                      value={orgDesc}
                      onChange={e => setOrgDesc(e.target.value)}
                      placeholder="What are you building?"
                      rows={2}
                      style={S.ta}
                      onFocus={e => Object.assign(e.currentTarget.style, S.inpF)}
                      onBlur={e => Object.assign(e.currentTarget.style, { border: S.ta.border, boxShadow: 'none' })}
                    />
                  </div>

                  <button
                    onClick={createOrg}
                    disabled={busy || orgName.trim().length < 2}
                    style={{ ...S.btn, ...(busy || orgName.trim().length < 2 ? S.btnOff : {}) }}
                    onMouseEnter={e => { if (!(busy || orgName.trim().length < 2)) (e.currentTarget as HTMLElement).style.background = '#18181b'; }}
                    onMouseLeave={e => { if (!(busy || orgName.trim().length < 2)) (e.currentTarget as HTMLElement).style.background = '#09090b'; }}
                  >
                    {busy ? <><Spin />Creating…</> : <>Continue <Ic.Arrow /></>}
                  </button>
                </div>
              </div>
            )}

            {/* ────── STEP 2 ────── */}
            {step === 2 && (
              <div>
                <p style={S.stepBadge}>Step 2 of 3</p>
                <h1 style={S.h1}>Get your API key</h1>
                <p style={S.desc}>This key authenticates your agents with Memron. Shown once — store it securely.</p>

                {/* Org badge */}
                {org && (
                  <div style={S.orgBadge}>
                    <span style={S.orgIndicator} />
                    <span style={{ color: '#e4e4e7', fontWeight: 600 }}>{org.name}</span>
                    <span style={{ color: '#3f3f46' }}>· /{org.slug}</span>
                  </div>
                )}

                {!apiKey ? (
                  /* ── No key in current session ── */
                  <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {keyAlreadyGenerated ? (
                      /* ── Key was generated before (refresh/returning) — full key unrecoverable ── */
                      <>
                        {/* Recovery notice */}
                        <div style={{ ...S.notice, border: '1px solid rgba(234,179,8,0.25)', background: 'rgba(234,179,8,0.05)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4m0 4h.01"/></svg>
                          <span style={{ color: '#a16207' }}>
                            You already generated an API key in a previous session. The full key
                            was shown <strong style={{ color: '#ca8a04' }}>once</strong> and cannot be retrieved.
                            If you saved it, confirm below and continue. If you lost it, you can
                            regenerate a new key from the <strong style={{ color: '#ca8a04' }}>dashboard</strong> after setup.
                          </span>
                        </div>

                        {/* Prefix display */}
                        <div style={S.keyBox}>
                          <div style={S.keyTop}>
                            <span style={S.keyLabel}>
                              <span style={{ ...S.keyPulse, background: '#ca8a04' }} />
                              Key prefix — full key hidden
                            </span>
                          </div>
                          <code style={{ ...S.keyVal, color: '#71717a' }}>
                            {existingKeyPrefix}{'─'.repeat(Math.max(0, 44 - existingKeyPrefix.length))}
                          </code>
                        </div>

                        {/* Confirm */}
                        <label style={S.confirmRow}>
                          <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={e => { setConfirmed(e.target.checked); setError(''); }}
                            style={{ accentColor: '#6366f1', width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
                          />
                          <span>I have already saved my API key and want to continue.</span>
                        </label>

                        <button
                          onClick={() => {
                            if (!confirmed) { setError('Confirm you have saved the key before continuing'); return; }
                            go(3);
                          }}
                          disabled={!confirmed}
                          style={{ ...S.btn, ...(!confirmed ? S.btnOff : {}) }}
                          onMouseEnter={e => { if (confirmed) (e.currentTarget as HTMLElement).style.background = '#18181b'; }}
                          onMouseLeave={e => { if (confirmed) (e.currentTarget as HTMLElement).style.background = '#09090b'; }}
                        >
                          Continue <Ic.Arrow />
                        </button>
                      </>
                    ) : (
                      /* ── First time — generate fresh key ── */
                      <>
                        <div style={S.notice}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
                          <span>We store only a secure hash — the full key is shown <strong style={{ color: '#e4e4e7' }}>once</strong>. If lost, generate a replacement from the dashboard.</span>
                        </div>
                        <button
                          onClick={genKey}
                          disabled={busy}
                          style={{ ...S.btn, ...(busy ? S.btnOff : {}) }}
                          onMouseEnter={e => { if (!busy) (e.currentTarget as HTMLElement).style.background = '#18181b'; }}
                          onMouseLeave={e => { if (!busy) (e.currentTarget as HTMLElement).style.background = '#09090b'; }}
                        >
                          {busy ? <><Spin />Generating…</> : <>Generate API Key</>}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  /* ── Side-by-side after key is generated ── */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20, alignItems: 'start' }}>

                    {/* LEFT — key controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                      {/* Key display */}
                      <div style={S.keyBox}>
                        <div style={S.keyTop}>
                          <span style={S.keyLabel}>
                            <span style={S.keyPulse} />
                            Live — save immediately
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => setShowKey(v => !v)} style={S.iconBtn} title={showKey ? 'Hide' : 'Show'}>
                              <Ic.Eye on={showKey} />
                            </button>
                            <button onClick={copy} style={{ ...S.iconBtn, ...(copied ? S.iconBtnCopied : {}) }}>
                              {copied ? <><Ic.Check />Copied</> : <><Ic.Copy />Copy</>}
                            </button>
                          </div>
                        </div>
                        <code style={S.keyVal}>
                          {showKey
                            ? apiKey.fullKey
                            : apiKey.prefix + '─'.repeat(38)}
                        </code>
                      </div>

                      {/* Confirm */}
                      <label style={S.confirmRow}>
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={e => { setConfirmed(e.target.checked); setError(''); }}
                          style={{ accentColor: '#6366f1', width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
                        />
                        <span>I have saved my API key. I understand it won't be shown again.</span>
                      </label>

                      {/* Continue */}
                      <button
                        onClick={() => {
                          if (!confirmed) { setError("Confirm you have saved the key before continuing"); return; }
                          go(3);
                        }}
                        disabled={!confirmed}
                        style={{ ...S.btn, ...(!confirmed ? S.btnOff : {}) }}
                        onMouseEnter={e => { if (confirmed) (e.currentTarget as HTMLElement).style.background = '#18181b'; }}
                        onMouseLeave={e => { if (confirmed) (e.currentTarget as HTMLElement).style.background = '#09090b'; }}
                      >
                        Continue <Ic.Arrow />
                      </button>
                    </div>

                    {/* RIGHT — terminal */}
                    <Terminal apiKey={showKey ? apiKey.fullKey : apiKey.prefix + '─'.repeat(38)} />
                  </div>
                )}
              </div>
            )}

            {/* ────── STEP 3 ────── */}
            {step === 3 && (
              <div>
                {/* Icon */}
                <div style={S.doneIcon}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <path d="M22 4 12 14.01l-3-3"/>
                  </svg>
                </div>

                <p style={S.stepBadge}>Setup complete</p>
                <h1 style={S.h1}>You're ready to build.</h1>
                <p style={S.desc}>Your Memron workspace is live. Integrate in under 5 minutes.</p>

                {/* 3-step install */}
                <div style={S.installGrid}>
                  {[
                    { n: '01', cmd: 'npm install @memron/sdk',          label: 'Install SDK' },
                    { n: '02', cmd: 'new Memron({ apiKey })',            label: 'Initialize' },
                    { n: '03', cmd: 'await client.add({ content })',     label: 'Store memory' },
                  ].map(item => (
                    <div key={item.n} style={S.installItem}>
                      <span style={S.installNum}>{item.n}</span>
                      <div>
                        <p style={S.installLabel}>{item.label}</p>
                        <code style={S.installCmd}>{item.cmd}</code>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Feature pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginBottom: 24 }}>
                  {['Cross-session memory','Multi-agent support','Sub-100ms retrieval','SOC-2 compliant'].map(f => (
                    <span key={f} style={S.pill}>{f}</span>
                  ))}
                </div>

                <button
                  onClick={finish}
                  disabled={busy}
                  style={{ ...S.btn, ...(busy ? S.btnOff : {}) }}
                  onMouseEnter={e => { if (!busy) (e.currentTarget as HTMLElement).style.background = '#18181b'; }}
                  onMouseLeave={e => { if (!busy) (e.currentTarget as HTMLElement).style.background = '#09090b'; }}
                >
                  {busy ? <><Spin />Opening…</> : <>Open Dashboard <Ic.Arrow /></>}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      <style>{`
        @keyframes onbSpin { to { transform: rotate(360deg); } }
        @keyframes onbFade { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
        * { box-sizing: border-box; }
        ::placeholder { color: #3f3f46 !important; }
        textarea { resize: none; }
      `}</style>
    </div>
  );
}

// ─── Terminal styles ──────────────────────────────────────────────────────────
const T: Record<string, React.CSSProperties> = {
  termWrap: {
    background: '#09090b',
    border: '1px solid #27272a',
    borderRadius: 12,
    overflow: 'hidden',
    height: '100%',
    minHeight: 320,
  },
  termBar: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '10px 14px',
    background: '#111113',
    borderBottom: '1px solid #1f1f23',
  },
  termDot: {
    display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
    background: '#ff5f57',
  },
  termTitle: {
    marginLeft: 8, fontSize: '0.7rem',
    color: '#3f3f46', fontFamily: "'JetBrains Mono',monospace",
    letterSpacing: '0.04em',
  },
  termBody: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 1 },
  termLineNum: {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: '0.68rem', color: '#27272a',
    userSelect: 'none', minWidth: 20, textAlign: 'right' as const,
    paddingRight: 12, flexShrink: 0,
  },
  termLine: {
    fontFamily: "'JetBrains Mono','Fira Code',monospace",
    fontSize: '0.74rem', lineHeight: 1.7, whiteSpace: 'pre' as const,
  },
};

// ─── Page styles ──────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative', minHeight: '100vh',
    background: '#09090b',
    fontFamily: "'Inter','Space Grotesk',system-ui,sans-serif",
    color: '#e4e4e7', overflow: 'hidden',
  },
  grid: {
    position: 'fixed', inset: 0,
    backgroundImage: 'linear-gradient(rgba(99,102,241,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.035) 1px,transparent 1px)',
    backgroundSize: '48px 48px', pointerEvents: 'none', zIndex: 0,
  },
  glow: {
    position: 'fixed', width: 600, height: 600, borderRadius: '50%',
    background: 'radial-gradient(circle,rgba(99,102,241,0.08) 0%,transparent 70%)',
    filter: 'blur(80px)', top: -150, left: -100, pointerEvents: 'none', zIndex: 0,
  },
  layout: {
    position: 'relative', zIndex: 1, display: 'flex', minHeight: '100vh',
  },

  // sidebar
  sidebar: {
    width: 256, flexShrink: 0,
    display: 'flex', flexDirection: 'column',
    padding: '32px 24px',
    borderRight: '1px solid #18181b',
    background: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(10px)',
  },
  logoRow: { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 36 },
  logoTxt: {
    fontSize: '1rem', fontWeight: 700, color: '#fff',
    letterSpacing: '-0.025em', fontFamily: "'Space Grotesk',sans-serif",
  },
  hl1: {
    fontSize: '1.25rem', fontWeight: 700, color: '#fff',
    letterSpacing: '-0.03em', lineHeight: 1.3, margin: 0,
    fontFamily: "'Space Grotesk',sans-serif",
  },
  hl2: {
    fontSize: '1.25rem', fontWeight: 700, color: '#27272a',
    letterSpacing: '-0.03em', lineHeight: 1.3, margin: 0,
    fontFamily: "'Space Grotesk',sans-serif",
  },
  sRow: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  sDot: {
    width: 28, height: 28, borderRadius: '50%',
    border: '1.5px solid #27272a', background: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#52525b', flexShrink: 0, transition: 'all 0.25s',
  },
  sDotA: {
    borderColor: '#6366f1', background: 'rgba(99,102,241,0.12)',
    color: '#818cf8', boxShadow: '0 0 0 3px rgba(99,102,241,0.1)',
  },
  sDotD: {
    borderColor: '#6366f1', background: '#6366f1', color: '#fff',
  },
  sLine: {
    width: 1, height: 30, background: '#1f1f23', margin: '3px 0',
  },
  sLineD: { background: 'rgba(99,102,241,0.35)' },
  chip: {
    display: 'flex', alignItems: 'center', gap: 9,
    padding: '11px 12px',
    background: '#0d0d10', border: '1px solid #1f1f23', borderRadius: 10,
    overflow: 'hidden',
  },
  avatar: {
    width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
  },
  chipName: {
    fontSize: '0.76rem', fontWeight: 600, color: '#d4d4d8', margin: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  chipEmail: {
    fontSize: '0.68rem', color: '#52525b', margin: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },

  // main
  main: {
    flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '60px 48px', overflowY: 'auto',
  },
  content: { width: '100%' },

  // typography
  stepBadge: {
    fontSize: '0.7rem', fontWeight: 700, color: '#6366f1',
    letterSpacing: '0.08em', textTransform: 'uppercase' as const,
    margin: '0 0 10px',
  },
  h1: {
    fontSize: '1.6rem', fontWeight: 700, color: '#fff',
    letterSpacing: '-0.03em', margin: '0 0 8px',
    fontFamily: "'Space Grotesk',sans-serif", lineHeight: 1.2,
  },
  desc: { fontSize: '0.86rem', color: '#71717a', lineHeight: 1.6, margin: 0 },

  // form
  lbl: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: '0.73rem', fontWeight: 600, color: '#71717a',
    marginBottom: 6, letterSpacing: '0.01em',
  },
  optional: {
    fontSize: '0.65rem', color: '#3f3f46', background: '#18181b',
    padding: '1px 6px', borderRadius: 4, fontWeight: 400,
  },
  inp: {
    width: '100%', padding: '10px 13px',
    background: '#0d0d10', border: '1px solid #27272a',
    borderRadius: 9, color: '#e4e4e7', fontSize: '0.87rem',
    fontFamily: 'inherit', outline: 'none',
  },
  inpF: { border: '1px solid rgba(99,102,241,0.55)', boxShadow: '0 0 0 3px rgba(99,102,241,0.08)' },
  ta: {
    width: '100%', padding: '10px 13px',
    background: '#0d0d10', border: '1px solid #27272a',
    borderRadius: 9, color: '#e4e4e7', fontSize: '0.87rem',
    fontFamily: 'inherit', outline: 'none', display: 'block',
  },

  btn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    width: '100%', padding: '12px 18px',
    background: '#09090b', border: '1px solid #27272a',
    borderRadius: 9, color: '#fff',
    fontSize: '0.87rem', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit', letterSpacing: '-0.01em',
    transition: 'background 0.15s',
  },
  btnOff: { background: '#111113', color: '#3f3f46', cursor: 'not-allowed', border: '1px solid #1f1f23' },

  // step 2
  orgBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 12px', margin: '16px 0 0',
    background: '#0d0d10', border: '1px solid #27272a',
    borderRadius: 7, fontSize: '0.78rem', color: '#a1a1aa',
  },
  orgIndicator: {
    width: 6, height: 6, borderRadius: '50%',
    background: '#6366f1', flexShrink: 0,
  },
  notice: {
    display: 'flex', alignItems: 'flex-start', gap: 9,
    padding: '12px 14px',
    background: '#0d0d10', border: '1px solid #27272a',
    borderRadius: 9, color: '#71717a', fontSize: '0.8rem', lineHeight: 1.5,
  },
  keyBox: {
    background: '#070709', border: '1px solid #27272a',
    borderRadius: 10, overflow: 'hidden',
  },
  keyTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '9px 12px', borderBottom: '1px solid #1f1f23',
    background: '#0d0d10',
  },
  keyLabel: {
    display: 'flex', alignItems: 'center', gap: 7,
    fontSize: '0.7rem', fontWeight: 600, color: '#a1a1aa',
    fontFamily: "'JetBrains Mono',monospace",
  },
  keyPulse: {
    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
    background: '#6366f1', animation: 'onbPulse 2s ease-in-out infinite',
  },
  keyVal: {
    display: 'block', padding: '12px 13px',
    fontFamily: "'JetBrains Mono','Fira Code',monospace",
    fontSize: '0.72rem', color: '#a5b4fc', wordBreak: 'break-all', lineHeight: 1.55,
    letterSpacing: '0.01em',
  },
  iconBtn: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '4px 9px', background: '#18181b', border: '1px solid #27272a',
    borderRadius: 6, color: '#71717a', fontSize: '0.7rem', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.15s',
  },
  iconBtnCopied: { background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8' },
  confirmRow: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '11px 13px', background: '#0d0d10',
    border: '1px solid #1f1f23', borderRadius: 9,
    cursor: 'pointer', fontSize: '0.78rem', color: '#71717a', lineHeight: 1.5,
  },

  // step 3
  doneIcon: {
    width: 46, height: 46, borderRadius: 12,
    border: '1px solid #27272a', background: '#0d0d10',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#818cf8', marginBottom: 16,
  },
  installGrid: {
    display: 'flex', flexDirection: 'column' as const,
    border: '1px solid #1f1f23', borderRadius: 10, overflow: 'hidden',
    margin: '24px 0 16px',
  },
  installItem: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '12px 15px', borderBottom: '1px solid #1f1f23',
  },
  installNum: {
    fontFamily: "'JetBrains Mono',monospace", fontSize: '0.68rem',
    fontWeight: 700, color: '#6366f1', minWidth: 24,
  },
  installLabel: { fontSize: '0.78rem', fontWeight: 600, color: '#d4d4d8', margin: '0 0 3px' },
  installCmd: {
    fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem',
    color: '#52525b', background: '#111113',
    padding: '2px 7px', borderRadius: 4, display: 'inline',
  },
  pill: {
    fontSize: '0.7rem', fontWeight: 500, color: '#71717a',
    background: '#111113', border: '1px solid #1f1f23',
    padding: '4px 10px', borderRadius: 20,
  },

  // error
  errBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', marginBottom: 16,
    background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 9, color: '#f87171', fontSize: '0.82rem',
  },
};
