'use client';

import { useUser, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useUserSync } from '@/lib/hooks/use-user-sync';
import { useEffect, useState } from 'react';
import { Sparkline } from './components/sparkline';
import { AreaChart, DonutChart, MiniBarChart, Heatmap } from './components/charts';
import {
  Brain, Search, Zap, Activity, Plus, Upload, RefreshCw, Settings,
  ChevronDown, Clock, Database, Cpu, Key,
  BarChart3, Layers, Timer, ArrowUpRight, ArrowDownRight,
  GitBranch, Terminal, Bell,
  CheckCircle2, Loader2,
  HardDrive, FolderOpen,
  PanelLeftClose, PanelLeftOpen, CloudUpload, LayoutGrid, ExternalLink,
} from 'lucide-react';

/* ════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════ */

interface OrgInfo { id: string; name: string; slug: string; description?: string }
interface UserInfo { universalId: string; email: string; fullName: string | null }
interface ApiKeyInfo { prefix: string; name: string; scopes: string[]; createdAt: string }

/* ════════════════════════════════════════════
   DEMO DATA (replace with real API later)
   ════════════════════════════════════════════ */

const SPARK_MEM   = [0, 0, 1, 2, 1, 3, 2, 4, 5, 3, 6, 8, 7, 9];
const SPARK_QUERY = [0, 0, 0, 1, 0, 2, 1, 1, 3, 2, 4, 3, 5, 4];
const SPARK_TOKEN = [0, 100, 200, 150, 400, 300, 500, 450, 600, 700, 550, 800, 900, 1100];
const SPARK_LAT   = [42, 38, 45, 41, 36, 39, 44, 40, 37, 43, 35, 38, 41, 36];

const AREA_DATA = [
  { label: 'Mon', value: 12 }, { label: 'Tue', value: 19 },
  { label: 'Wed', value: 8 },  { label: 'Thu', value: 24 },
  { label: 'Fri', value: 16 }, { label: 'Sat', value: 5 },
  { label: 'Sun', value: 10 },
];

const DONUT_DATA = [
  { value: 24, color: '#6366f1', label: 'Conversations' },
  { value: 15, color: '#8b5cf6', label: 'Documents' },
  { value: 8,  color: '#a78bfa', label: 'Code Snippets' },
  { value: 5,  color: '#c4b5fd', label: 'Structured' },
];

const BAR_DAYS = [
  { label: 'M', value: 12, color: '#6366f1' },
  { label: 'T', value: 19, color: '#6366f1' },
  { label: 'W', value: 8,  color: '#6366f1' },
  { label: 'T', value: 24, color: '#6366f1' },
  { label: 'F', value: 16, color: '#6366f1' },
  { label: 'S', value: 5,  color: '#818cf8' },
  { label: 'S', value: 10, color: '#818cf8' },
];

const HEAT = [
  [0,0,1,2,3,1,0,0,2,4,5,3,2,1,0,0,1,3,4,2,1,0,0,0],
  [0,0,0,1,2,2,1,0,3,5,6,4,3,2,1,0,2,4,5,3,0,0,0,0],
  [0,0,1,2,4,3,1,1,4,6,7,5,3,2,1,0,3,5,6,4,2,1,0,0],
  [0,0,0,1,3,2,1,0,2,4,5,4,2,1,0,0,2,3,4,2,1,0,0,0],
  [0,0,1,2,3,2,0,0,3,5,6,5,3,2,1,0,1,4,5,3,1,0,0,0],
  [0,0,0,0,1,1,0,0,1,2,3,2,1,0,0,0,0,1,2,1,0,0,0,0],
  [0,0,0,0,0,1,0,0,0,1,2,1,0,0,0,0,0,0,1,0,0,0,0,0],
];
const HEAT_ROWS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const HEAT_COLS = ['0','','','3','','','6','','','9','','','12','','','15','','','18','','','21','',''];

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  desc: string;
  time: string;
  status: 'success' | 'error' | 'warning' | 'info';
}

const ACTIVITY: ActivityItem[] = [
  { id:'1', type:'memory',  title:'New memory indexed',        desc:'Conversation context from ChatGPT session',  time:'2 min ago', status:'success' },
  { id:'2', type:'api',     title:'API query processed',       desc:'Semantic search — 3 results returned',       time:'5 min ago', status:'success' },
  { id:'3', type:'sync',    title:'Data source synced',        desc:'Synced 12 new entries from connected service', time:'18 min ago', status:'success' },
  { id:'4', type:'memory',  title:'Bulk import completed',     desc:'47 memories indexed from CSV upload',         time:'1 hr ago',  status:'success' },
  { id:'5', type:'error',   title:'Rate limit reached',        desc:'API key mk_prod_... exceeded 100 req/min',    time:'2 hr ago',  status:'error'   },
  { id:'6', type:'api',     title:'Memory retrieval',          desc:'Context injection for agent session',          time:'3 hr ago',  status:'success' },
];

/* ════════════════════════════════════════════
   SMALL HELPERS
   ════════════════════════════════════════════ */

function MetricDelta({ value, suffix = '' }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:2,
      fontSize:11, fontWeight:600,
      color: up ? '#34d399' : '#f87171',
      background: up ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
      padding:'2px 6px', borderRadius:6,
    }}>
      {up ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>}
      {up ? '+' : ''}{value}{suffix}
    </span>
  );
}

function StatusDot({ status }: { status:'healthy'|'degraded'|'down' }) {
  const c = { healthy:'#34d399', degraded:'#fbbf24', down:'#f87171' }[status];
  return (
    <span style={{ position:'relative', display:'inline-flex', alignItems:'center' }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:c, boxShadow:`0 0 6px ${c}60` }}/>
      {status==='healthy' && (
        <span style={{
          position:'absolute', width:7, height:7, borderRadius:'50%',
          background:c, animation:'ping 2s cubic-bezier(0,0,0.2,1) infinite', opacity:0.5,
        }}/>
      )}
    </span>
  );
}

function SectionHead({ icon:Icon, title, right }: { icon:any; title:string; right?:React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <Icon size={14} style={{ color:'#6366f1' }}/>
        <span style={{ fontSize:12, fontWeight:600, color:'#a1a1aa', textTransform:'uppercase', letterSpacing:'0.06em', fontFamily:"'Inter',sans-serif" }}>{title}</span>
      </div>
      {right}
    </div>
  );
}

/* Card wrapper */
function Card({ children, span=1, rowSpan=1, noPad=false, glow=false, className='' }:
  { children:React.ReactNode; span?:number; rowSpan?:number; noPad?:boolean; glow?:boolean; className?:string }) {
  return (
    <div className={className} style={{
      gridColumn:`span ${span}`, gridRow:`span ${rowSpan}`,
      background:'rgba(24,24,27,0.55)', backdropFilter:'blur(16px)',
      border:'1px solid rgba(63,63,70,0.35)', borderRadius:14,
      padding: noPad ? 0 : '16px 18px',
      position:'relative', overflow:'hidden',
      transition:'border-color 0.2s, box-shadow 0.2s',
      ...(glow ? { boxShadow:'0 0 20px rgba(99,102,241,0.06)' } : {}),
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(99,102,241,0.25)'; e.currentTarget.style.boxShadow='0 0 24px rgba(99,102,241,0.08)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(63,63,70,0.35)'; e.currentTarget.style.boxShadow=glow?'0 0 20px rgba(99,102,241,0.06)':'none'; }}
    >{children}</div>
  );
}

/* ════════════════════════════════════════════
   SIDEBAR
   ════════════════════════════════════════════ */

const NAV = [
  { id:'overview',    icon:LayoutGrid, label:'Overview'    },
  { id:'memories',    icon:Brain,      label:'Memories'    },
  { id:'search',      icon:Search,     label:'Search'      },
  { id:'analytics',   icon:BarChart3,  label:'Analytics'   },
  { id:'connections', icon:GitBranch,  label:'Connections' },
  { id:'api',         icon:Terminal,   label:'API & Keys'  },
];

function Sidebar({ collapsed, toggle, org, active, nav, signOut, user }:
  { collapsed:boolean; toggle:()=>void; org:OrgInfo|null; active:string; nav:(s:string)=>void; signOut:()=>void; user:any }) {
  const w = collapsed ? 64 : 220;
  return (
    <aside style={{
      width:w, minHeight:'100vh',
      background:'rgba(13,13,15,0.95)', borderRight:'1px solid rgba(63,63,70,0.25)',
      display:'flex', flexDirection:'column',
      transition:'width 0.25s cubic-bezier(0.4,0,0.2,1)',
      position:'fixed', top:0, left:0, bottom:0, zIndex:50, overflow:'hidden',
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed?'16px 12px':'16px 18px',
        display:'flex', alignItems:'center', gap:10,
        borderBottom:'1px solid rgba(63,63,70,0.2)', height:56,
      }}>
        <Image src="/logo_w.png" alt="Memron" width={28} height={28} style={{ flexShrink:0 }}/>
        {!collapsed && <span style={{ fontSize:16, fontWeight:700, color:'#fff', fontFamily:"'Space Grotesk',sans-serif", whiteSpace:'nowrap' }}>Memron</span>}
        <button onClick={toggle} style={{
          marginLeft:'auto', background:'none', border:'none', color:'#71717a',
          cursor:'pointer', padding:4, borderRadius:6, display:'flex', transition:'color 0.15s',
        }}
        onMouseEnter={e=>{e.currentTarget.style.color='#a1a1aa'}}
        onMouseLeave={e=>{e.currentTarget.style.color='#71717a'}}
        >
          {collapsed ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}
        </button>
      </div>

      {/* Org pill */}
      {!collapsed && org && (
        <div style={{
          margin:'12px 12px 4px', padding:'8px 10px',
          background:'rgba(99,102,241,0.06)', border:'1px solid rgba(99,102,241,0.12)',
          borderRadius:8, cursor:'pointer',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{
              width:24, height:24, borderRadius:6,
              background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, fontWeight:700, color:'#fff', flexShrink:0,
            }}>{org.name.charAt(0).toUpperCase()}</div>
            <div style={{ overflow:'hidden' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#e4e4e7', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{org.name}</div>
              <div style={{ fontSize:10, color:'#71717a' }}>Free Plan</div>
            </div>
            <ChevronDown size={12} style={{ color:'#71717a', marginLeft:'auto', flexShrink:0 }}/>
          </div>
        </div>
      )}

      {/* Nav items */}
      <nav style={{ flex:1, padding:'8px', display:'flex', flexDirection:'column', gap:2 }}>
        {NAV.map(it => {
          const on = active===it.id;
          return (
            <button key={it.id} onClick={()=>nav(it.id)} title={collapsed?it.label:undefined}
              style={{
                display:'flex', alignItems:'center', gap:10,
                padding: collapsed?'10px 12px':'8px 12px',
                borderRadius:8, border:'none',
                background: on?'rgba(99,102,241,0.12)':'transparent',
                color: on?'#818cf8':'#a1a1aa',
                cursor:'pointer', fontSize:13, fontWeight: on?600:500,
                fontFamily:"'Inter',sans-serif", transition:'all 0.15s',
                justifyContent: collapsed?'center':'flex-start',
                width:'100%', textAlign:'left',
              }}
              onMouseEnter={e=>{ if(!on){ e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#e4e4e7'; }}}
              onMouseLeave={e=>{ if(!on){ e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#a1a1aa'; }}}
            >
              <it.icon size={16} style={{ flexShrink:0 }}/>
              {!collapsed && <span style={{ whiteSpace:'nowrap' }}>{it.label}</span>}
              {on && !collapsed && <div style={{ width:4, height:4, borderRadius:'50%', background:'#6366f1', marginLeft:'auto', boxShadow:'0 0 6px #6366f180' }}/>}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div style={{ padding:'8px', borderTop:'1px solid rgba(63,63,70,0.2)' }}>
        <button onClick={()=>nav('settings')} title={collapsed?'Settings':undefined}
          style={{
            display:'flex', alignItems:'center', gap:10,
            padding: collapsed?'10px 12px':'8px 12px', borderRadius:8, border:'none',
            background:'transparent', color:'#71717a', cursor:'pointer',
            fontSize:13, fontWeight:500, fontFamily:"'Inter',sans-serif",
            justifyContent: collapsed?'center':'flex-start', width:'100%', transition:'all 0.15s',
          }}
          onMouseEnter={e=>{e.currentTarget.style.color='#a1a1aa'; e.currentTarget.style.background='rgba(255,255,255,0.04)'}}
          onMouseLeave={e=>{e.currentTarget.style.color='#71717a'; e.currentTarget.style.background='transparent'}}
        >
          <Settings size={16} style={{ flexShrink:0 }}/>{!collapsed && <span>Settings</span>}
        </button>

        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 8px 6px', marginTop:4 }}>
          {user?.imageUrl && <Image src={user.imageUrl} alt="User" width={collapsed?28:30} height={collapsed?28:30} style={{ borderRadius:8, flexShrink:0 }}/>}
          {!collapsed && (
            <div style={{ overflow:'hidden', flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#e4e4e7', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.fullName||user?.firstName||'User'}</div>
              <div style={{ fontSize:10, color:'#52525b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.emailAddresses?.[0]?.emailAddress}</div>
            </div>
          )}
          {!collapsed && (
            <button onClick={signOut} title="Sign out" style={{
              background:'none', border:'none', color:'#52525b', cursor:'pointer', padding:4, borderRadius:4, transition:'color 0.15s',
            }}
            onMouseEnter={e=>{e.currentTarget.style.color='#f87171'}}
            onMouseLeave={e=>{e.currentTarget.style.color='#52525b'}}
            ><ExternalLink size={14}/></button>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ════════════════════════════════════════════
   DASHBOARD PAGE
   ════════════════════════════════════════════ */

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const { isReady } = useUserSync();

  const [organization, setOrganization] = useState<OrgInfo|null>(null);
  const [userInfo, setUserInfo]         = useState<UserInfo|null>(null);
  const [apiKeyInfo, setApiKeyInfo]     = useState<ApiKeyInfo|null>(null);
  const [collapsed, setCollapsed]       = useState(false);
  const [active, setActive]             = useState('overview');
  const [cmdOpen, setCmdOpen]           = useState(false);
  const [now, setNow]                   = useState(new Date());

  // clock
  useEffect(() => { const t = setInterval(()=>setNow(new Date()), 60_000); return ()=>clearInterval(t); }, []);

  // prevent back
  useEffect(() => {
    window.history.replaceState(null,'','/dashboard');
    const h = () => window.history.pushState(null,'','/dashboard');
    window.history.pushState(null,'','/dashboard');
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []);

  // fetch data
  useEffect(() => {
    if (!isLoaded || !user) return;
    (async () => {
      try {
        const r = await fetch('/api/onboarding', { credentials:'include' });
        if (!r.ok) return;
        const ct = r.headers.get('content-type')||'';
        if (!ct.includes('application/json')) return;
        const d = await r.json();
        if (d.organization) setOrganization(d.organization);
        if (d.user) setUserInfo(d.user);
        if (d.apiKey) setApiKeyInfo(d.apiKey);
      } catch {}
    })();
  }, [isLoaded, user]);

  // Ctrl+K
  useEffect(() => {
    const h = (e:KeyboardEvent) => { if ((e.ctrlKey||e.metaKey) && e.key==='k') { e.preventDefault(); setCmdOpen(p=>!p); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const doSignOut = async () => {
    document.cookie = 'memron_onboarded=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    await signOut();
    router.push('/');
  };

  /* ── Loading ── */
  if (!isLoaded || !isReady) {
    return (
      <div style={{ minHeight:'100vh', background:'#09090b', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <Loader2 size={36} style={{ color:'#6366f1', animation:'spin 1s linear infinite', marginBottom:12 }}/>
          <p style={{ color:'#71717a', fontSize:13, fontFamily:"'Inter',sans-serif" }}>Loading your command center…</p>
        </div>
      </div>
    );
  }

  const sideW = collapsed ? 64 : 220;
  const greet = (() => { const h=now.getHours(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening'; })();

  /* ══════════════ RENDER ══════════════ */
  return (
    <div style={{ minHeight:'100vh', background:'#09090b', display:'flex' }}>
      {/* CSS */}
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes ping{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.5);opacity:0}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        .dc{animation:fadeIn .35s ease both}
        .dc:nth-child(1){animation-delay:.02s}.dc:nth-child(2){animation-delay:.05s}.dc:nth-child(3){animation-delay:.08s}
        .dc:nth-child(4){animation-delay:.11s}.dc:nth-child(5){animation-delay:.14s}.dc:nth-child(6){animation-delay:.17s}
        .dc:nth-child(7){animation-delay:.20s}.dc:nth-child(8){animation-delay:.23s}.dc:nth-child(9){animation-delay:.26s}
        .ds::-webkit-scrollbar{width:4px}.ds::-webkit-scrollbar-track{background:transparent}
        .ds::-webkit-scrollbar-thumb{background:rgba(99,102,241,.2);border-radius:4px}
        .ds::-webkit-scrollbar-thumb:hover{background:rgba(99,102,241,.4)}
      `}</style>

      <Sidebar collapsed={collapsed} toggle={()=>setCollapsed(c=>!c)} org={organization} active={active} nav={setActive} signOut={doSignOut} user={user}/>

      <div style={{ flex:1, marginLeft:sideW, transition:'margin-left .25s cubic-bezier(.4,0,.2,1)', display:'flex', flexDirection:'column', minHeight:'100vh' }}>

        {/* ─── Top bar ─── */}
        <header style={{
          height:52, borderBottom:'1px solid rgba(63,63,70,0.2)',
          display:'flex', alignItems:'center', padding:'0 24px',
          background:'rgba(13,13,15,0.7)', backdropFilter:'blur(12px)',
          position:'sticky', top:0, zIndex:40,
        }}>
          <span style={{ fontSize:13, fontWeight:600, color:'#e4e4e7', fontFamily:"'Inter',sans-serif" }}>Overview</span>
          <span style={{ fontSize:11, color:'#52525b', fontFamily:"'Inter',sans-serif", marginLeft:6 }}>/ {organization?.name||'Workspace'}</span>

          <button onClick={()=>setCmdOpen(true)} style={{
            marginLeft:'auto', display:'flex', alignItems:'center', gap:8,
            padding:'5px 12px', background:'rgba(255,255,255,0.03)',
            border:'1px solid rgba(63,63,70,0.3)', borderRadius:8,
            color:'#52525b', cursor:'pointer', fontSize:12, fontFamily:"'Inter',sans-serif", transition:'all .15s',
          }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(99,102,241,0.3)'; e.currentTarget.style.color='#a1a1aa'}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(63,63,70,0.3)'; e.currentTarget.style.color='#52525b'}}
          >
            <Search size={13}/>
            <span>Search or command…</span>
            <kbd style={{ fontSize:10, padding:'1px 5px', background:'rgba(255,255,255,0.06)', borderRadius:4, color:'#71717a', border:'1px solid rgba(63,63,70,0.3)', fontFamily:"'Inter',sans-serif" }}>Ctrl K</kbd>
          </button>

          <button style={{ background:'none', border:'none', color:'#52525b', cursor:'pointer', padding:6, borderRadius:6, marginLeft:12, transition:'color .15s' }}
            onMouseEnter={e=>{e.currentTarget.style.color='#a1a1aa'}} onMouseLeave={e=>{e.currentTarget.style.color='#52525b'}} title="Notifications">
            <Bell size={16}/>
          </button>
        </header>

        {/* ─── Content ─── */}
        <main style={{ flex:1, padding:'20px 24px 40px', overflowY:'auto' }} className="ds">

          {/* Greeting */}
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20 }}>
            <div>
              <h1 style={{ fontSize:22, fontWeight:700, color:'#fafafa', fontFamily:"'Space Grotesk',sans-serif", letterSpacing:'-0.02em', marginBottom:2 }}>
                {greet}, {user?.firstName||'there'}
              </h1>
              <p style={{ fontSize:12.5, color:'#52525b', fontFamily:"'Inter',sans-serif" }}>
                {now.toLocaleDateString('en-US',{ weekday:'long', month:'long', day:'numeric', year:'numeric' })}
                {userInfo?.universalId && <span style={{ marginLeft:12, color:'#3f3f46' }}>ID: {userInfo.universalId.slice(0,12)}…</span>}
              </p>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {[
                { icon:Plus,      label:'Add Memory', c:'#6366f1' },
                { icon:Upload,    label:'Import',     c:'#8b5cf6' },
                { icon:RefreshCw, label:'Sync',        c:'#34d399' },
              ].map((a,i)=>(
                <button key={i} title={a.label} style={{
                  display:'flex', alignItems:'center', gap:6, padding:'6px 12px',
                  background:`${a.c}10`, border:`1px solid ${a.c}25`, borderRadius:8,
                  color:a.c, cursor:'pointer', fontSize:12, fontWeight:500, fontFamily:"'Inter',sans-serif", transition:'all .15s',
                }}
                onMouseEnter={e=>{e.currentTarget.style.background=`${a.c}20`; e.currentTarget.style.borderColor=`${a.c}40`}}
                onMouseLeave={e=>{e.currentTarget.style.background=`${a.c}10`; e.currentTarget.style.borderColor=`${a.c}25`}}
                ><a.icon size={13}/>{a.label}</button>
              ))}
            </div>
          </div>

          {/* ═══ ROW 1 — KPI cards ═══ */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
            {([
              { icon:Brain,  label:'Total Memories',  val:'52',   delta:12, suf:'%',  spark:SPARK_MEM,   c:'#6366f1' },
              { icon:Search, label:'Search Queries',   val:'184',  delta:8,  suf:'%',  spark:SPARK_QUERY, c:'#8b5cf6' },
              { icon:Zap,    label:'Tokens Used',      val:'1.1K', delta:-3, suf:'%',  spark:SPARK_TOKEN, c:'#f59e0b' },
              { icon:Timer,  label:'Avg Latency',      val:'38ms', delta:-5, suf:'ms', spark:SPARK_LAT,   c:'#34d399' },
            ] as const).map((m,i)=>(
              <Card key={i} className="dc">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                      <div style={{ width:28, height:28, borderRadius:7, background:`${m.c}12`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <m.icon size={14} style={{ color:m.c }}/>
                      </div>
                      <span style={{ fontSize:11.5, color:'#71717a', fontWeight:500, fontFamily:"'Inter',sans-serif" }}>{m.label}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
                      <span style={{ fontSize:26, fontWeight:700, color:'#fafafa', fontFamily:"'Space Grotesk',sans-serif", letterSpacing:'-0.03em', lineHeight:1 }}>{m.val}</span>
                      <MetricDelta value={m.delta} suffix={m.suf}/>
                    </div>
                  </div>
                  <Sparkline data={[...m.spark]} color={m.c} width={80} height={28}/>
                </div>
              </Card>
            ))}
          </div>

          {/* ═══ ROW 2 — Charts + System ═══ */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 320px', gap:12, marginBottom:16 }}>
            {/* Memory Activity */}
            <Card className="dc">
              <SectionHead icon={Activity} title="Memory Activity" right={
                <div style={{ display:'flex', gap:4 }}>
                  {['7d','30d','90d'].map(p=>(
                    <button key={p} style={{
                      fontSize:10, padding:'2px 8px', borderRadius:5,
                      background: p==='7d'?'rgba(99,102,241,0.15)':'transparent',
                      color: p==='7d'?'#818cf8':'#52525b',
                      border:'none', cursor:'pointer', fontWeight: p==='7d'?600:400, fontFamily:"'Inter',sans-serif",
                    }}>{p}</button>
                  ))}
                </div>
              }/>
              <AreaChart data={AREA_DATA} width={380} height={140} color="#6366f1" showGrid showLabels/>
            </Card>

            {/* Token Consumption */}
            <Card className="dc">
              <SectionHead icon={Zap} title="Token Consumption" right={<span style={{ fontSize:10, color:'#52525b' }}>This week</span>}/>
              <div style={{ display:'flex', alignItems:'center', gap:20 }}>
                <MiniBarChart data={BAR_DAYS} height={100} barWidth={28} gap={6}/>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div><div style={{ fontSize:10, color:'#71717a', marginBottom:2 }}>Total</div><div style={{ fontSize:20, fontWeight:700, color:'#fafafa', fontFamily:"'Space Grotesk',sans-serif" }}>1,124</div></div>
                  <div><div style={{ fontSize:10, color:'#71717a', marginBottom:2 }}>Limit</div><div style={{ fontSize:14, fontWeight:600, color:'#a1a1aa', fontFamily:"'Space Grotesk',sans-serif" }}>1,000,000</div></div>
                  <div style={{ width:80, height:4, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ width:'0.11%', height:'100%', background:'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius:4 }}/>
                  </div>
                  <div style={{ fontSize:9, color:'#52525b' }}>0.11% used</div>
                </div>
              </div>
            </Card>

            {/* System Health */}
            <Card className="dc" glow>
              <SectionHead icon={Cpu} title="System Health"/>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  { l:'API Gateway',       s:'healthy' as const, ms:'12ms' },
                  { l:'Memory Index',      s:'healthy' as const, ms:'38ms' },
                  { l:'Vector Store',      s:'healthy' as const, ms:'24ms' },
                  { l:'Embedding Pipeline',s:'healthy' as const, ms:'45ms' },
                  { l:'Cache Layer',       s:'healthy' as const, ms:'3ms'  },
                ].map((x,i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom: i<4?'1px solid rgba(63,63,70,0.15)':'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <StatusDot status={x.s}/>
                      <span style={{ fontSize:12, color:'#d4d4d8', fontFamily:"'Inter',sans-serif" }}>{x.l}</span>
                    </div>
                    <span style={{ fontSize:11, color:'#52525b', fontFamily:"'Space Grotesk',sans-serif", fontWeight:500 }}>{x.ms}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:12, padding:'8px 10px', background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.12)', borderRadius:8, display:'flex', alignItems:'center', gap:6 }}>
                <CheckCircle2 size={13} style={{ color:'#34d399' }}/>
                <span style={{ fontSize:11, color:'#34d399', fontWeight:500, fontFamily:"'Inter',sans-serif" }}>All systems operational</span>
              </div>
            </Card>
          </div>

          {/* ═══ ROW 3 — Heatmap + Categories + Activity ═══ */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 320px', gap:12, marginBottom:16 }}>
            {/* Query Heatmap */}
            <Card className="dc">
              <SectionHead icon={BarChart3} title="Query Heatmap" right={<span style={{ fontSize:10, color:'#52525b' }}>Last 7 days</span>}/>
              <div style={{ overflow:'auto' }}>
                <Heatmap data={HEAT} labels={{ rows:HEAT_ROWS, cols:HEAT_COLS }} cellSize={11} gap={2}/>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:10 }}>
                <span style={{ fontSize:10, color:'#52525b' }}>Less</span>
                {['rgba(99,102,241,0.05)','rgba(99,102,241,0.2)','rgba(99,102,241,0.4)','rgba(99,102,241,0.65)','#6366f1'].map((c,i)=>(
                  <div key={i} style={{ width:10, height:10, borderRadius:2, background:c }}/>
                ))}
                <span style={{ fontSize:10, color:'#52525b' }}>More</span>
              </div>
            </Card>

            {/* Memory Categories */}
            <Card className="dc">
              <SectionHead icon={Layers} title="Memory Categories" right={
                <button style={{ fontSize:10, color:'#6366f1', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>View all →</button>
              }/>
              <DonutChart segments={DONUT_DATA} size={90} thickness={12}/>
              <div style={{ marginTop:12, padding:'8px 10px', background:'rgba(255,255,255,0.02)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:11, color:'#71717a' }}>Uncategorized</span>
                <span style={{ fontSize:11, color:'#a1a1aa', fontWeight:600 }}>0</span>
              </div>
            </Card>

            {/* Activity Feed */}
            <Card className="dc" noPad>
              <div style={{ padding:'14px 16px 8px' }}>
                <SectionHead icon={Clock} title="Activity Feed" right={
                  <button style={{ fontSize:10, color:'#52525b', background:'none', border:'none', cursor:'pointer' }}>Clear</button>
                }/>
              </div>
              <div className="ds" style={{ maxHeight:240, overflowY:'auto', padding:'0 12px 12px' }}>
                {ACTIVITY.map((it,i)=>(
                  <div key={it.id} style={{
                    display:'flex', gap:10, padding:'8px 4px',
                    borderBottom: i<ACTIVITY.length-1?'1px solid rgba(63,63,70,0.12)':'none',
                    animation:`slideIn .3s ease ${i*0.05}s both`,
                  }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, marginTop:6,
                      background: it.status==='success'?'#34d399':it.status==='error'?'#f87171':'#fbbf24' }}/>
                    <div style={{ flex:1, overflow:'hidden' }}>
                      <div style={{ fontSize:12, fontWeight:500, color:'#d4d4d8', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.title}</div>
                      <div style={{ fontSize:10.5, color:'#52525b', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.desc}</div>
                    </div>
                    <span style={{ fontSize:10, color:'#3f3f46', whiteSpace:'nowrap', flexShrink:0 }}>{it.time}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ═══ ROW 4 — API Perf + Sources + Key ═══ */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 320px', gap:12, marginBottom:16 }}>
            {/* API Performance */}
            <Card className="dc">
              <SectionHead icon={Terminal} title="API Performance"/>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { ep:'POST /v1/memories',     n:47,  avg:'42ms', p99:'180ms', s:'healthy' as const },
                  { ep:'GET  /v1/search',        n:184, avg:'38ms', p99:'220ms', s:'healthy' as const },
                  { ep:'GET  /v1/memories/:id',   n:23,  avg:'18ms', p99:'65ms',  s:'healthy' as const },
                  { ep:'DEL  /v1/memories/:id',   n:3,   avg:'28ms', p99:'90ms',  s:'healthy' as const },
                ].map((x,i)=>(
                  <div key={i} style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'7px 10px', background:'rgba(255,255,255,0.02)', borderRadius:8,
                    border:'1px solid rgba(63,63,70,0.12)',
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, overflow:'hidden' }}>
                      <StatusDot status={x.s}/>
                      <span style={{ fontSize:11.5, color:'#d4d4d8', fontFamily:"'Space Grotesk',monospace", fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{x.ep}</span>
                    </div>
                    <div style={{ display:'flex', gap:16, flexShrink:0 }}>
                      <div style={{ textAlign:'right' }}><div style={{ fontSize:9, color:'#52525b' }}>calls</div><div style={{ fontSize:12, color:'#a1a1aa', fontWeight:600 }}>{x.n}</div></div>
                      <div style={{ textAlign:'right' }}><div style={{ fontSize:9, color:'#52525b' }}>avg</div><div style={{ fontSize:12, color:'#34d399', fontWeight:600 }}>{x.avg}</div></div>
                      <div style={{ textAlign:'right' }}><div style={{ fontSize:9, color:'#52525b' }}>p99</div><div style={{ fontSize:12, color:'#fbbf24', fontWeight:600 }}>{x.p99}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Data Sources */}
            <Card className="dc">
              <SectionHead icon={GitBranch} title="Data Sources" right={
                <button style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#6366f1', background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.15)', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontWeight:500 }}>
                  <Plus size={10}/> Connect
                </button>
              }/>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { name:'ChatGPT',       icon:'🤖', st:'connected',    mem:24, sync:'2 min ago'     },
                  { name:'Notion',         icon:'📝', st:'connected',    mem:15, sync:'1 hr ago'      },
                  { name:'Slack',          icon:'💬', st:'pending',      mem:0,  sync:'Not synced'    },
                  { name:'Google Drive',   icon:'📁', st:'disconnected', mem:0,  sync:'Not connected' },
                ].map((s,i)=>(
                  <div key={i} style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'8px 10px', background:'rgba(255,255,255,0.02)', borderRadius:8,
                    border:'1px solid rgba(63,63,70,0.12)', cursor:'pointer', transition:'border-color .15s',
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(99,102,241,0.2)'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(63,63,70,0.12)'}}
                  >
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:18 }}>{s.icon}</span>
                      <div>
                        <div style={{ fontSize:12, fontWeight:500, color:'#d4d4d8' }}>{s.name}</div>
                        <div style={{ fontSize:10, color:'#52525b' }}>{s.sync}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {s.mem>0 && <span style={{ fontSize:10, color:'#71717a', fontWeight:500 }}>{s.mem} memories</span>}
                      <span style={{
                        fontSize:9, fontWeight:600, padding:'2px 6px', borderRadius:4,
                        textTransform:'uppercase', letterSpacing:'0.04em',
                        background: s.st==='connected'?'rgba(52,211,153,0.1)':s.st==='pending'?'rgba(251,191,36,0.1)':'rgba(255,255,255,0.04)',
                        color: s.st==='connected'?'#34d399':s.st==='pending'?'#fbbf24':'#52525b',
                      }}>{s.st}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* API Key */}
            <Card className="dc">
              <SectionHead icon={Key} title="API Key"/>
              {apiKeyInfo ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ padding:'10px 12px', background:'rgba(255,255,255,0.03)', borderRadius:8, border:'1px solid rgba(63,63,70,0.2)' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontSize:11, color:'#71717a' }}>{apiKeyInfo.name}</span>
                      <span style={{ fontSize:9, color:'#34d399', background:'rgba(52,211,153,0.1)', padding:'1px 6px', borderRadius:4, fontWeight:600 }}>Active</span>
                    </div>
                    <div style={{ fontSize:13, color:'#a1a1aa', fontFamily:"'Space Grotesk',monospace", fontWeight:500 }}>{apiKeyInfo.prefix}••••••••</div>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                    {apiKeyInfo.scopes.map(s=>(
                      <span key={s} style={{ fontSize:9, padding:'2px 6px', background:'rgba(99,102,241,0.08)', color:'#818cf8', borderRadius:4, fontWeight:500 }}>{s}</span>
                    ))}
                  </div>
                  <div style={{ fontSize:10, color:'#3f3f46' }}>Created {new Date(apiKeyInfo.createdAt).toLocaleDateString()}</div>
                </div>
              ) : (
                <div style={{ padding:20, textAlign:'center', background:'rgba(255,255,255,0.02)', borderRadius:8, border:'1px dashed rgba(63,63,70,0.3)' }}>
                  <Key size={20} style={{ color:'#3f3f46', margin:'0 auto 8px' }}/>
                  <p style={{ fontSize:12, color:'#52525b', marginBottom:8 }}>No API key found</p>
                  <button style={{ fontSize:11, padding:'5px 14px', background:'#6366f1', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontWeight:600 }}>Generate Key</button>
                </div>
              )}
              <div style={{ marginTop:12, padding:'8px 10px', background:'rgba(0,0,0,0.3)', borderRadius:8, border:'1px solid rgba(63,63,70,0.15)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:9, color:'#52525b', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>Quick Start</span>
                  <span style={{ fontSize:9, color:'#6366f1', cursor:'pointer' }}>Copy</span>
                </div>
                <pre style={{ fontSize:10.5, color:'#a1a1aa', fontFamily:"'Space Grotesk',monospace", margin:0, lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
{`import Memron from '@memron/sdk'

const client = new Memron({
  apiKey: '${apiKeyInfo?.prefix||'mk_...'}••••'
})`}
                </pre>
              </div>
            </Card>
          </div>

          {/* ═══ ROW 5 — Pipeline + Workspace ═══ */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {/* Indexing Pipeline */}
            <Card className="dc">
              <SectionHead icon={Database} title="Indexing Pipeline"/>
              <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:14 }}>
                {[
                  { l:'Queued',     v:0,  c:'#f59e0b' },
                  { l:'Processing', v:0,  c:'#6366f1' },
                  { l:'Indexed',    v:52, c:'#34d399' },
                  { l:'Failed',     v:0,  c:'#f87171' },
                ].map((s,i)=>(
                  <div key={i} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:20, fontWeight:700, color:s.c, fontFamily:"'Space Grotesk',sans-serif" }}>{s.v}</div>
                    <div style={{ fontSize:10, color:'#52525b' }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', alignItems:'center' }}>
                {([
                  { l:'Ingest', I:CloudUpload, ok:true },
                  { l:'Chunk',  I:Layers,      ok:true },
                  { l:'Embed',  I:Cpu,         ok:true },
                  { l:'Index',  I:Database,    ok:true },
                  { l:'Cache',  I:HardDrive,   ok:true },
                ] as const).map((st,i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', flex:1 }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flex:1 }}>
                      <div style={{
                        width:30, height:30, borderRadius:'50%',
                        background: st.ok?'rgba(52,211,153,0.12)':'rgba(255,255,255,0.04)',
                        border:`1.5px solid ${st.ok?'#34d399':'rgba(63,63,70,0.3)'}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}>
                        <st.I size={13} style={{ color: st.ok?'#34d399':'#52525b' }}/>
                      </div>
                      <span style={{ fontSize:9, color: st.ok?'#a1a1aa':'#52525b' }}>{st.l}</span>
                    </div>
                    {i<4 && <div style={{ width:20, height:1.5, background: st.ok?'#34d399':'rgba(63,63,70,0.3)', margin:'0 -4px', marginBottom:14, borderRadius:1 }}/>}
                  </div>
                ))}
              </div>
            </Card>

            {/* Workspace */}
            <Card className="dc">
              <SectionHead icon={FolderOpen} title="Workspace"/>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  { l:'Organization', v:organization?.name||'—', s:organization?.slug||'' },
                  { l:'Plan',         v:'Free',    s:'1M tokens/mo' },
                  { l:'Members',      v:'1',       s:'Owner'        },
                  { l:'Connections',   v:'2',       s:'Active'       },
                  { l:'Storage Used',  v:'0.02 MB', s:'of 100 MB'   },
                  { l:'Uptime',        v:'99.9%',   s:'Last 30 days' },
                ].map((it,i)=>(
                  <div key={i} style={{ padding:'8px 10px', background:'rgba(255,255,255,0.02)', borderRadius:8, border:'1px solid rgba(63,63,70,0.1)' }}>
                    <div style={{ fontSize:10, color:'#52525b', marginBottom:3 }}>{it.l}</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#e4e4e7', fontFamily:"'Space Grotesk',sans-serif" }}>{it.v}</div>
                    <div style={{ fontSize:9.5, color:'#3f3f46' }}>{it.s}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

        </main>
      </div>

      {/* ═══ Command Palette ═══ */}
      {cmdOpen && (
        <div style={{
          position:'fixed', inset:0, zIndex:100,
          background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)',
          display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:140,
        }} onClick={()=>setCmdOpen(false)}>
          <div onClick={e=>e.stopPropagation()} style={{
            width:520, background:'rgba(24,24,27,0.97)',
            border:'1px solid rgba(63,63,70,0.3)', borderRadius:14,
            boxShadow:'0 20px 60px rgba(0,0,0,0.5)', overflow:'hidden',
            animation:'fadeIn .15s ease',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', borderBottom:'1px solid rgba(63,63,70,0.2)' }}>
              <Search size={16} style={{ color:'#52525b' }}/>
              <input autoFocus placeholder="Search memories, commands, settings…" style={{ flex:1, background:'none', border:'none', outline:'none', color:'#e4e4e7', fontSize:14, fontFamily:"'Inter',sans-serif" }}/>
              <kbd style={{ fontSize:10, padding:'2px 6px', background:'rgba(255,255,255,0.06)', borderRadius:4, color:'#52525b', border:'1px solid rgba(63,63,70,0.3)' }}>ESC</kbd>
            </div>
            <div style={{ padding:8 }}>
              {[
                { i:Plus,      l:'Create new memory',  k:'Ctrl N' },
                { i:Search,    l:'Search memories',     k:'Ctrl F' },
                { i:Upload,    l:'Import from file',    k:'Ctrl I' },
                { i:RefreshCw, l:'Sync all sources',    k:'Ctrl S' },
                { i:Key,       l:'Manage API keys',     k:''       },
                { i:Settings,  l:'Open settings',       k:'Ctrl ,' },
              ].map((c,idx)=>(
                <button key={idx} style={{
                  display:'flex', alignItems:'center', gap:10, width:'100%',
                  padding:'8px 10px', borderRadius:8, background:'transparent',
                  border:'none', color:'#a1a1aa', cursor:'pointer', fontSize:13,
                  fontFamily:"'Inter',sans-serif", transition:'all .1s', textAlign:'left',
                }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(99,102,241,0.08)'; e.currentTarget.style.color='#e4e4e7'}}
                onMouseLeave={e=>{e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#a1a1aa'}}
                >
                  <c.i size={15} style={{ color:'#6366f1' }}/>
                  <span style={{ flex:1 }}>{c.l}</span>
                  {c.k && <kbd style={{ fontSize:10, padding:'1px 5px', background:'rgba(255,255,255,0.04)', borderRadius:4, color:'#52525b', border:'1px solid rgba(63,63,70,0.2)' }}>{c.k}</kbd>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
