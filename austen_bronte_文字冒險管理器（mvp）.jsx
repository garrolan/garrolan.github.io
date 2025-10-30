import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

// --- Utility: lightweight UUID fallback if uuid is unavailable ---
function uid() {
  try { return uuidv4(); } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
}

// --- Types ---
type Theme = "austen" | "bronte";

type Stats = {
  reputation: number; // 名譽
  fellowship: number; // 情誼（總覽）
  estate: number; // 家產
  decorum: number; // 體面
  inspiration: number; // 靈感
  wit: number; // 機智
  experience: number; // 閱歷
  education: number; // 教養
  manners: number; // 禮儀
  resolve: number; // 堅定
  health: number; // 體健
  rounds: number; // 回合數
};

type Player = {
  id: "player";
  name: string;
  title: string;
  age?: number;
  residence?: string;
  bio?: string;
  avatarUrl?: string; // dataURL or https URL
};

type EventItem = {
  id: string;
  date: string; // ISO
  title: string;
  summary: string;
  tags: string[];
  npcIds: string[];
  deltas?: Partial<Stats>;
  pinned?: boolean;
};

type NPC = {
  id: string;
  name: string;
  title?: string;
  faction?: string;
  avatarUrl?: string;
  relation: number;
  notes?: string;
  eventIds: string[];
};

type SaveFileV1 = {
  meta: { version: 1; updatedAt: string; theme: Theme };
  player: Player;
  stats: Stats;
  events: EventItem[];
  npcs: NPC[];
  settings: { autoLogStatChange: boolean };
};

const STORAGE_KEY = "ab-manager:v1";

// --- Initial Seed (Lady Aurelia) ---
const initialSave: SaveFileV1 = {
  meta: { version: 1, updatedAt: new Date().toISOString(), theme: "austen" },
  player: {
    id: "player",
    name: "Lady Aurelia Whitmore",
    title: "落魄伯爵遺孀",
    age: 27,
    residence: "Rosemere House, Yorkshire",
    bio: "曾為倫敦社交界的寵兒，通曉鋼琴、詩歌與法語，如今以筆維生；在名譽與自由之間，嘗試走出自己的道路。",
    avatarUrl: "" // 可稍後上傳
  },
  stats: {
    reputation: 60,
    fellowship: 0,
    estate: 40,
    decorum: 70,
    inspiration: 30,
    wit: 1,
    experience: 2,
    education: 3,
    manners: 3,
    resolve: 1,
    health: 0,
    rounds: 1
  },
  events: [],
  npcs: [
    {
      id: uid(),
      name: "Mr. Julian Harcourt",
      title: "家族監管代表、紳士",
      faction: "Whitmore 家族",
      relation: 5,
      notes: "受兄長所託視察莊園，禮貌中帶試探。",
      avatarUrl: "",
      eventIds: []
    },
    {
      id: uid(),
      name: "Mr. Frederick Ashbury",
      title: "《倫敦晨報》副編輯",
      faction: "倫敦文壇",
      relation: 0,
      notes: "邀以男性筆名發表文章。",
      avatarUrl: "",
      eventIds: []
    },
    {
      id: uid(),
      name: "Catherine Blythe",
      title: "表妹兼伴侍女",
      faction: "家務",
      relation: 8,
      notes: "善理帳冊，忠誠務實。",
      avatarUrl: "",
      eventIds: []
    }
  ],
  settings: { autoLogStatChange: false }
};

// --- Reducer & Actions ---

type Action =
  | { type: "LOAD"; payload: SaveFileV1 }
  | { type: "UPDATE_META"; payload: Partial<SaveFileV1["meta"]> }
  | { type: "UPDATE_PLAYER"; payload: Partial<Player> }
  | { type: "UPDATE_STATS"; payload: Partial<Stats>; reason?: string }
  | { type: "ADJUST_STAT"; key: keyof Stats; delta: number; reason?: string }
  | { type: "SET_THEME"; theme: Theme }
  | { type: "ADD_EVENT"; payload: EventItem }
  | { type: "UPDATE_EVENT"; id: string; payload: Partial<EventItem> }
  | { type: "DELETE_EVENT"; id: string }
  | { type: "ADD_NPC"; payload: NPC }
  | { type: "UPDATE_NPC"; id: string; payload: Partial<NPC> }
  | { type: "DELETE_NPC"; id: string }
  | { type: "LINK_EVENT_NPC"; eventId: string; npcId: string }
  | { type: "IMPORT_SAVE"; payload: SaveFileV1 }
  | { type: "RESET" };

function clampInt(n: number, min = -999, max = 999) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function reducer(state: SaveFileV1, action: Action): SaveFileV1 {
  switch (action.type) {
    case "LOAD":
      return action.payload;
    case "UPDATE_META":
      return { ...state, meta: { ...state.meta, ...action.payload, updatedAt: new Date().toISOString() } };
    case "UPDATE_PLAYER":
      return { ...state, player: { ...state.player, ...action.payload }, meta: { ...state.meta, updatedAt: new Date().toISOString() } };
    case "SET_THEME":
      return { ...state, meta: { ...state.meta, theme: action.theme, updatedAt: new Date().toISOString() } };

    case "UPDATE_STATS": {
      const nextStats: Stats = { ...state.stats } as Stats;
      for (const [k, v] of Object.entries(action.payload)) {
        const key = k as keyof Stats;
        // @ts-ignore
        nextStats[key] = clampInt(v as number);
      }
      return { ...state, stats: nextStats, meta: { ...state.meta, updatedAt: new Date().toISOString() } };
    }

    case "ADJUST_STAT": {
      const key = action.key;
      const next = clampInt((state.stats[key] as number) + action.delta);
      const stats = { ...state.stats, [key]: next } as Stats;
      let events = state.events;
      if (state.settings.autoLogStatChange) {
        const ev: EventItem = {
          id: uid(),
          date: new Date().toISOString(),
          title: `數值變動：${key} ${action.delta >= 0 ? "+" : ""}${action.delta}`,
          summary: action.reason || "（自動記錄）",
          tags: ["系統", "數值"],
          npcIds: [],
          deltas: { [key]: action.delta } as Partial<Stats>,
          pinned: false
        };
        events = [ev, ...events];
      }
      return { ...state, stats, events, meta: { ...state.meta, updatedAt: new Date().toISOString() } };
    }

    case "ADD_EVENT":
      return { ...state, events: [action.payload, ...state.events], meta: { ...state.meta, updatedAt: new Date().toISOString() } };
    case "UPDATE_EVENT":
      return {
        ...state,
        events: state.events.map(e => (e.id === action.id ? { ...e, ...action.payload } : e)),
        meta: { ...state.meta, updatedAt: new Date().toISOString() }
      };
    case "DELETE_EVENT":
      return { ...state, events: state.events.filter(e => e.id !== action.id), meta: { ...state.meta, updatedAt: new Date().toISOString() } };

    case "ADD_NPC":
      return { ...state, npcs: [action.payload, ...state.npcs], meta: { ...state.meta, updatedAt: new Date().toISOString() } };
    case "UPDATE_NPC":
      return {
        ...state,
        npcs: state.npcs.map(n => (n.id === action.id ? { ...n, ...action.payload } : n)),
        meta: { ...state.meta, updatedAt: new Date().toISOString() }
      };
    case "DELETE_NPC":
      return { ...state, npcs: state.npcs.filter(n => n.id !== action.id), meta: { ...state.meta, updatedAt: new Date().toISOString() } };
    case "LINK_EVENT_NPC": {
      const npcs = state.npcs.map(n => (n.id === action.npcId ? { ...n, eventIds: Array.from(new Set([action.eventId, ...n.eventIds])) } : n));
      const events = state.events.map(e => (e.id === action.eventId ? { ...e, npcIds: Array.from(new Set([action.npcId, ...e.npcIds])) } : e));
      return { ...state, npcs, events, meta: { ...state.meta, updatedAt: new Date().toISOString() } };
    }

    case "IMPORT_SAVE":
      return action.payload;
    case "RESET":
      return initialSave;
    default:
      return state;
  }
}

// --- Persistence Hook ---
function usePersistentState() {
  const [state, dispatch] = useReducer(reducer, initialSave);
  const loadedRef = useRef(false);

  // Load
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const data = JSON.parse(raw) as SaveFileV1;
        loadedRef.current = true;
        dispatch({ type: "LOAD", payload: data });
      } catch (e) {
        console.warn("Failed to parse save file, using initial.", e);
      }
    } else {
      loadedRef.current = true;
    }
  }, []);

  // Save (debounced)
  const saveRef = useRef<number | null>(null);
  useEffect(() => {
    if (!loadedRef.current) return;
    if (saveRef.current) window.clearTimeout(saveRef.current);
    saveRef.current = window.setTimeout(() => {
      const payload = { ...state, meta: { ...state.meta, updatedAt: new Date().toISOString() } } as SaveFileV1;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }, 300);
    return () => {
      if (saveRef.current) window.clearTimeout(saveRef.current);
    };
  }, [state]);

  return { state, dispatch };
}

// --- UI Helpers ---
const Section: React.FC<{ title: string; right?: React.ReactNode; className?: string }> = ({ title, right, className, children }) => (
  <div className={`bg-white/80 dark:bg-neutral-900/60 rounded-2xl shadow p-4 mb-4 ${className || ""}`}>
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {right}
    </div>
    {children}
  </div>
);

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm text-neutral-600 dark:text-neutral-300">{children}</label>;
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white/60 dark:bg-neutral-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function NumberAdjuster({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const step = (d: number) => onChange(clampInt(value + d));
  const setFromInput = (v: string) => {
    const n = parseInt(v, 10);
    if (!isNaN(n)) onChange(clampInt(n));
  };
  return (
    <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/60 rounded-xl p-2">
      <div className="font-medium mr-2">{label}</div>
      <div className="flex items-center gap-2">
        <button className="px-2 py-1 rounded-lg border" onClick={() => step(-5)}>-5</button>
        <button className="px-2 py-1 rounded-lg border" onClick={() => step(-1)}>-1</button>
        <input
          className="w-16 text-center rounded-md border border-neutral-300 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900"
          defaultValue={value}
          onBlur={(e) => setFromInput(e.target.value)}
        />
        <button className="px-2 py-1 rounded-lg border" onClick={() => step(+1)}>+1</button>
        <button className="px-2 py-1 rounded-lg border" onClick={() => step(+5)}>+5</button>
      </div>
    </div>
  );
}

function AvatarUploader({ url, onChange }: { url?: string; onChange: (u: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const loadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string; // dataURL
      onChange(data);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="flex items-start gap-4">
      <div className="w-28 h-28 rounded-2xl overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
        {url ? <img src={url} alt="avatar" className="w-full h-full object-cover" /> : <span className="text-neutral-500">無頭像</span>}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded-xl bg-indigo-600 text-white" onClick={() => fileRef.current?.click()}>上傳圖片</button>
          <button className="px-3 py-2 rounded-xl border" onClick={() => onChange("")}>移除</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
        <Label>或貼上圖片 URL：</Label>
        <TextInput value={url || ""} onChange={onChange} placeholder="https://..." />
      </div>
    </div>
  );
}

// --- Export/Import helpers ---
function download(filename: string, text: string) {
  const element = document.createElement("a");
  element.setAttribute("href", "data:application/json;charset=utf-8," + encodeURIComponent(text));
  element.setAttribute("download", filename);
  element.style.display = "none";
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

// --- Main App ---
export default function App() {
  const { state, dispatch } = usePersistentState();
  const [tab, setTab] = useState<"player" | "stats" | "events" | "npcs" | "settings">("player");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.meta.theme === "bronte");
  }, [state.meta.theme]);

  const themeBg = state.meta.theme === "austen" ? "bg-gradient-to-br from-amber-50 to-rose-50" : "bg-gradient-to-br from-stone-900 to-emerald-950";
  const themeText = state.meta.theme === "austen" ? "text-neutral-800" : "text-neutral-100";

  return (
    <div className={`${themeBg} min-h-screen ${themeText}`}>
      <header className="sticky top-0 z-10 backdrop-blur bg-white/50 dark:bg-black/40 border-b border-white/20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white grid place-items-center font-bold">AB</div>
            <div>
              <div className="font-semibold">Austen/Brontë 文字冒險管理器</div>
              <div className="text-xs opacity-70">本地保存 · 最後更新：{new Date(state.meta.updatedAt).toLocaleString()}</div>
            </div>
          </div>
          <nav className="flex gap-2">
            {([
              ["player", "主角"],
              ["stats", "數值"],
              ["events", "事件"],
              ["npcs", "NPC"],
              ["settings", "備份⚙️"]
            ] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-xl ${tab === k ? "bg-indigo-600 text-white" : "border"}`}>{label}</button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === "player" && <PlayerPage state={state} dispatch={dispatch} />}
        {tab === "stats" && <StatsPage state={state} dispatch={dispatch} />}
        {tab === "events" && <EventsPage state={state} dispatch={dispatch} />}
        {tab === "npcs" && <NPCsPage state={state} dispatch={dispatch} />}
        {tab === "settings" && <SettingsPage state={state} dispatch={dispatch} />}
      </main>
    </div>
  );
}

// --- Pages ---
function PlayerPage({ state, dispatch }: { state: SaveFileV1; dispatch: React.Dispatch<Action> }) {
  const p = state.player;
  const s = state.stats;
  const onChange = (patch: Partial<Player>) => dispatch({ type: "UPDATE_PLAYER", payload: patch });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Section title="主角介紹">
        <div className="grid gap-3">
          <Label>姓名</Label>
          <TextInput value={p.name} onChange={(v) => onChange({ name: v })} />
          <Label>身份/稱謂</Label>
          <TextInput value={p.title} onChange={(v) => onChange({ title: v })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>年齡</Label>
              <TextInput value={String(p.age ?? "") } onChange={(v) => onChange({ age: parseInt(v || "0") || undefined })} />
            </div>
            <div>
              <Label>居所</Label>
              <TextInput value={p.residence || ""} onChange={(v) => onChange({ residence: v })} />
            </div>
          </div>
          <Label>簡介</Label>
          <textarea className="w-full min-h-[120px] rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white/60 dark:bg-neutral-800 p-3" value={p.bio || ""} onChange={(e) => onChange({ bio: e.target.value })} />
        </div>
      </Section>
      <Section title="主角頭像">
        <AvatarUploader url={p.avatarUrl} onChange={(u) => onChange({ avatarUrl: u })} />
      </Section>

      <Section title="核心數值">
        <div className="grid gap-2">
          <StatBinder label="名譽" value={s.reputation} onChange={(n, reason) => dispatch({ type: "ADJUST_STAT", key: "reputation", delta: n - s.reputation, reason })} />
          <StatBinder label="情誼(總)" value={s.fellowship} onChange={(n, reason) => dispatch({ type: "ADJUST_STAT", key: "fellowship", delta: n - s.fellowship, reason })} />
          <StatBinder label="家產" value={s.estate} onChange={(n, reason) => dispatch({ type: "ADJUST_STAT", key: "estate", delta: n - s.estate, reason })} />
          <StatBinder label="體面" value={s.decorum} onChange={(n, reason) => dispatch({ type: "ADJUST_STAT", key: "decorum", delta: n - s.decorum, reason })} />
          <StatBinder label="靈感" value={s.inspiration} onChange={(n, reason) => dispatch({ type: "ADJUST_STAT", key: "inspiration", delta: n - s.inspiration, reason })} />
        </div>
      </Section>
      <Section title="六維能力＋回合">
        <div className="grid gap-2">
          <InlineAdjust label="機智" value={s.wit} onDelta={(d, reason) => dispatch({ type: "ADJUST_STAT", key: "wit", delta: d, reason })} />
          <InlineAdjust label="閱歷" value={s.experience} onDelta={(d, reason) => dispatch({ type: "ADJUST_STAT", key: "experience", delta: d, reason })} />
          <InlineAdjust label="教養" value={s.education} onDelta={(d, reason) => dispatch({ type: "ADJUST_STAT", key: "education", delta: d, reason })} />
          <InlineAdjust label="禮儀" value={s.manners} onDelta={(d, reason) => dispatch({ type: "ADJUST_STAT", key: "manners", delta: d, reason })} />
          <InlineAdjust label="堅定" value={s.resolve} onDelta={(d, reason) => dispatch({ type: "ADJUST_STAT", key: "resolve", delta: d, reason })} />
          <InlineAdjust label="體健" value={s.health} onDelta={(d, reason) => dispatch({ type: "ADJUST_STAT", key: "health", delta: d, reason })} />
          <InlineAdjust label="回合" value={s.rounds} onDelta={(d) => dispatch({ type: "ADJUST_STAT", key: "rounds", delta: d })} highlightRound />
        </div>
        {s.rounds % 3 === 0 && (
          <div className="mt-3 p-3 rounded-xl bg-amber-100 text-amber-900 dark:bg-yellow-900/40 dark:text-yellow-100">🔔 提醒：第 {s.rounds} 回合——可安排一次重大事件（舞會／書信／公評／遺囑）。</div>
        )}
      </Section>
    </div>
  );
}

function StatBinder({ label, value, onChange }: { label: string; value: number; onChange: (n: number, reason?: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
      <div className="md:col-span-1 font-medium">{label}</div>
      <div className="md:col-span-2">
        <div className="flex items-center gap-2">
          <NumberAdjuster label="" value={value} onChange={(n) => onChange(n, reason || undefined)} />
        </div>
        <input className="mt-2 w-full rounded-md border px-2 py-1" placeholder="可選：這次變動的原因備註" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </div>
  );
}

function InlineAdjust({ label, value, onDelta, highlightRound }: { label: string; value: number; onDelta: (d: number, reason?: string) => void; highlightRound?: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <div className={`flex items-center justify-between ${highlightRound ? "bg-indigo-50 dark:bg-indigo-900/30" : "bg-neutral-50 dark:bg-neutral-800/60"} rounded-xl p-2`}>
      <div className="font-medium">{label}</div>
      <div className="flex items-center gap-2">
        <button className="px-2 py-1 rounded-lg border" onClick={() => onDelta(-5, reason || undefined)}>-5</button>
        <button className="px-2 py-1 rounded-lg border" onClick={() => onDelta(-1, reason || undefined)}>-1</button>
        <div className="w-10 text-center">{value}</div>
        <button className="px-2 py-1 rounded-lg border" onClick={() => onDelta(+1, reason || undefined)}>+1</button>
        <button className="px-2 py-1 rounded-lg border" onClick={() => onDelta(+5, reason || undefined)}>+5</button>
      </div>
      <input className="ml-2 flex-1 max-w-[300px] rounded-md border px-2 py-1" placeholder="備註（可空白）" value={reason} onChange={(e) => setReason(e.target.value)} />
    </div>
  );
}

function EventsPage({ state, dispatch }: { state: SaveFileV1; dispatch: React.Dispatch<Action> }) {
  const [filter, setFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [npcFilter, setNpcFilter] = useState("");

  const events = useMemo(() => {
    return state.events.filter(e => {
      const okSearch = !filter || e.title.toLowerCase().includes(filter.toLowerCase()) || e.summary.toLowerCase().includes(filter.toLowerCase());
      const okTag = !tagFilter || e.tags.includes(tagFilter);
      const okNpc = !npcFilter || e.npcIds.includes(npcFilter);
      return okSearch && okTag && okNpc;
    });
  }, [state.events, filter, tagFilter, npcFilter]);

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Section title="新增事件">
        <EventForm state={state} dispatch={dispatch} />
      </Section>
      <div className="md:col-span-2">
        <Section title="事件列表" right={<div className="text-sm opacity-70">共 {events.length} 筆</div>}>
          <div className="flex flex-wrap gap-2 mb-3">
            <input className="rounded-md border px-2 py-1" placeholder="搜尋標題或摘要" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <select className="rounded-md border px-2 py-1" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="">標籤篩選</option>
              {Array.from(new Set(state.events.flatMap(e => e.tags))).map(t => (<option key={t} value={t}>{t}</option>))}
            </select>
            <select className="rounded-md border px-2 py-1" value={npcFilter} onChange={(e) => setNpcFilter(e.target.value)}>
              <option value="">NPC 篩選</option>
              {state.npcs.map(n => (<option key={n.id} value={n.id}>{n.name}</option>))}
            </select>
          </div>
          <div className="grid gap-3">
            {events.map(ev => (
              <EventCard key={ev.id} ev={ev} state={state} dispatch={dispatch} />
            ))}
            {events.length === 0 && <div className="text-sm opacity-70">（目前沒有符合條件的事件）</div>}
          </div>
        </Section>
      </div>
    </div>
  );
}

function EventForm({ state, dispatch }: { state: SaveFileV1; dispatch: React.Dispatch<Action> }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [npcIds, setNpcIds] = useState<string[]>([]);
  const [deltas, setDeltas] = useState<Partial<Stats>>({});

  const toggleTag = (t: string) => setTags(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));
  const toggleNpc = (id: string) => setNpcIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const submit = () => {
    if (!title.trim()) return alert("請輸入事件標題");
    const ev: EventItem = {
      id: uid(),
      date: new Date(date).toISOString(),
      title: title.trim(),
      summary,
      tags,
      npcIds,
      deltas: Object.keys(deltas).length ? deltas : undefined,
      pinned: false
    };
    dispatch({ type: "ADD_EVENT", payload: ev });
    npcIds.forEach(id => dispatch({ type: "LINK_EVENT_NPC", eventId: ev.id, npcId: id }));
    // Apply deltas to stats if provided
    if (ev.deltas) {
      Object.entries(ev.deltas).forEach(([k, v]) => {
        const key = k as keyof Stats;
        const current = state.stats[key] as number;
        const next = clampInt((current || 0) + (v as number));
        dispatch({ type: "UPDATE_STATS", payload: { [key]: next } as Partial<Stats> });
      });
    }
    // reset
    setTitle(""); setSummary(""); setTags([]); setNpcIds([]); setDeltas({});
  };

  const StatDelta = ({ k, label }: { k: keyof Stats; label: string }) => (
    <div className="flex items-center gap-2">
      <div className="w-28 text-sm">{label}</div>
      <input
        type="number"
        className="w-24 rounded-md border px-2 py-1"
        placeholder="±整數"
        value={(deltas[k] as number) ?? ""}
        onChange={(e) => {
          const val = e.target.value;
          setDeltas(prev => ({ ...prev, [k]: val === "" ? undefined : clampInt(parseInt(val)) }));
        }}
      />
    </div>
  );

  return (
    <div className="grid gap-2">
      <Label>標題</Label>
      <TextInput value={title} onChange={setTitle} placeholder="如：〈論自由與得體〉刊登／畫商議價／莊園巡查" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>日期</Label>
          <input type="date" className="w-full rounded-xl border px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>標籤（點選切換）</Label>
          <div className="flex flex-wrap gap-2">
            {["文名", "家產", "舞會", "書信", "公評", "遺囑", "系統", "數值"].map(t => (
              <button type="button" key={t} className={`px-2 py-1 rounded-full border ${tags.includes(t) ? "bg-indigo-600 text-white" : ""}`} onClick={() => toggleTag(t)}>{t}</button>
            ))}
          </div>
        </div>
      </div>
      <Label>摘要（可貼上你的故事段落）</Label>
      <textarea className="w-full min-h-[140px] rounded-xl border px-3 py-2" value={summary} onChange={(e) => setSummary(e.target.value)} />
      <Label>關聯 NPC（多選）</Label>
      <div className="flex flex-wrap gap-2">
        {state.npcs.map(n => (
          <button key={n.id} type="button" className={`px-2 py-1 rounded-full border ${npcIds.includes(n.id) ? "bg-emerald-600 text-white" : ""}`} onClick={() => toggleNpc(n.id)}>{n.name}</button>
        ))}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer select-none">可選：同時記錄數值變動</summary>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-2">
          <StatDelta k="reputation" label="名譽" />
          <StatDelta k="fellowship" label="情誼(總)" />
          <StatDelta k="estate" label="家產" />
          <StatDelta k="decorum" label="體面" />
          <StatDelta k="inspiration" label="靈感" />
          <StatDelta k="wit" label="機智" />
          <StatDelta k="experience" label="閱歷" />
          <StatDelta k="education" label="教養" />
          <StatDelta k="manners" label="禮儀" />
          <StatDelta k="resolve" label="堅定" />
          <StatDelta k="health" label="體健" />
          <StatDelta k="rounds" label="回合" />
        </div>
      </details>
      <div className="pt-2 flex gap-2">
        <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white" onClick={submit}>新增事件</button>
        <button className="px-4 py-2 rounded-xl border" onClick={() => { setTitle(""); setSummary(""); setTags([]); setNpcIds([]); setDeltas({}); }}>清空表單</button>
      </div>
    </div>
  );
}

function EventCard({ ev, state, dispatch }: { ev: EventItem; state: SaveFileV1; dispatch: React.Dispatch<Action> }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(ev.title);
  const [summary, setSummary] = useState(ev.summary);
  const [tags, setTags] = useState<string[]>(ev.tags);
  const [pinned, setPinned] = useState(!!ev.pinned);
  const npcs = state.npcs.filter(n => ev.npcIds.includes(n.id));

  const save = () => {
    dispatch({ type: "UPDATE_EVENT", id: ev.id, payload: { title, summary, tags, pinned } });
    setEditing(false);
  };

  return (
    <div className="rounded-2xl border p-3 bg-white/70 dark:bg-neutral-900/60">
      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">{new Date(ev.date).toLocaleString()}</div>
        <div className="flex gap-2">
          <button className={`px-2 py-1 rounded-lg border ${pinned ? "bg-yellow-400" : ""}`} onClick={() => { setPinned(!pinned); dispatch({ type: "UPDATE_EVENT", id: ev.id, payload: { pinned: !pinned } }); }}>📌</button>
          <button className="px-2 py-1 rounded-lg border" onClick={() => setEditing(v => !v)}>{editing ? "完成" : "編輯"}</button>
          <button className="px-2 py-1 rounded-lg border" onClick={() => { if (confirm("確定要刪除此事件？")) dispatch({ type: "DELETE_EVENT", id: ev.id }); }}>刪除</button>
        </div>
      </div>
      {editing ? (
        <div className="mt-2 grid gap-2">
          <TextInput value={title} onChange={setTitle} />
          <textarea className="w-full min-h-[100px] rounded-md border px-2 py-1" value={summary} onChange={(e) => setSummary(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {["文名", "家產", "舞會", "書信", "公評", "遺囑", "系統", "數值"].map(t => (
              <button key={t} className={`px-2 py-1 rounded-full border ${tags.includes(t) ? "bg-indigo-600 text-white" : ""}`} onClick={() => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}>{t}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white" onClick={save}>儲存</button>
            <button className="px-3 py-1.5 rounded-xl border" onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <div className="text-lg font-semibold">{ev.title}</div>
          <div className="mt-1 whitespace-pre-wrap">{ev.summary}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {ev.tags.map(t => (<span key={t} className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 border">#{t}</span>))}
          </div>
          {npcs.length > 0 && (
            <div className="mt-2 text-sm opacity-80">關聯：{npcs.map(n => n.name).join("、 ")}</div>
          )}
          {ev.deltas && (
            <details className="mt-2">
              <summary className="cursor-pointer select-none text-sm">數值變動</summary>
              <pre className="bg-neutral-50 dark:bg-neutral-800 rounded-md p-2 text-xs mt-1">{JSON.stringify(ev.deltas, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function NPCsPage({ state, dispatch }: { state: SaveFileV1; dispatch: React.Dispatch<Action> }) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [faction, setFaction] = useState("");
  const [notes, setNotes] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  const submit = () => {
    if (!name.trim()) return alert("請輸入 NPC 姓名");
    const npc: NPC = { id: uid(), name: name.trim(), title, faction, notes, avatarUrl, relation: 0, eventIds: [] };
    dispatch({ type: "ADD_NPC", payload: npc });
    setName(""); setTitle(""); setFaction(""); setNotes(""); setAvatarUrl("");
  };

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Section title="新增 NPC">
        <div className="grid gap-2">
          <Label>姓名</Label>
          <TextInput value={name} onChange={setName} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>稱謂/身分</Label>
              <TextInput value={title} onChange={setTitle} />
            </div>
            <div>
              <Label>陣營/階級</Label>
              <TextInput value={faction} onChange={setFaction} />
            </div>
          </div>
          <Label>頭像</Label>
          <AvatarUploader url={avatarUrl} onChange={setAvatarUrl} />
          <Label>備註</Label>
          <textarea className="w-full min-h-[100px] rounded-xl border px-3 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="pt-2 flex gap-2">
            <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white" onClick={submit}>新增 NPC</button>
            <button className="px-4 py-2 rounded-xl border" onClick={() => { setName(""); setTitle(""); setFaction(""); setNotes(""); setAvatarUrl(""); }}>清空</button>
          </div>
        </div>
      </Section>
      <div className="md:col-span-2">
        <Section title="NPC 列表" right={<div className="text-sm opacity-70">共 {state.npcs.length} 位</div>}>
          <div className="grid gap-3">
            {state.npcs.map(n => (<NPCCard key={n.id} npc={n} state={state} dispatch={dispatch} />))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function NPCCard({ npc, state, dispatch }: { npc: NPC; state: SaveFileV1; dispatch: React.Dispatch<Action> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(npc.name);
  const [title, setTitle] = useState(npc.title || "");
  const [faction, setFaction] = useState(npc.faction || "");
  const [notes, setNotes] = useState(npc.notes || "");
  const [avatarUrl, setAvatarUrl] = useState(npc.avatarUrl || "");
  const [relation, setRelation] = useState(npc.relation);

  const save = () => {
    dispatch({ type: "UPDATE_NPC", id: npc.id, payload: { name, title, faction, notes, avatarUrl, relation } });
    setEditing(false);
  };

  const changeRel = (d: number) => setRelation(clampInt(relation + d));

  const relatedEvents = state.events.filter(e => e.npcIds.includes(npc.id));

  return (
    <div className="rounded-2xl border p-3 bg-white/70 dark:bg-neutral-900/60">
      <div className="flex items-start gap-4">
        <div className="w-20 h-20 rounded-xl overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
          {avatarUrl ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" /> : <span className="text-neutral-500 text-sm">無頭像</span>}
        </div>
        <div className="flex-1">
          {editing ? (
            <div className="grid gap-2">
              <TextInput value={name} onChange={setName} />
              <div className="grid grid-cols-2 gap-3">
                <TextInput value={title} onChange={setTitle} />
                <TextInput value={faction} onChange={setFaction} />
              </div>
              <AvatarUploader url={avatarUrl} onChange={setAvatarUrl} />
              <textarea className="w-full min-h-[80px] rounded-md border px-2 py-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="flex items-center gap-2">
                <div className="font-medium">關係</div>
                <button className="px-2 py-1 rounded-lg border" onClick={() => changeRel(-5)}>-5</button>
                <button className="px-2 py-1 rounded-lg border" onClick={() => changeRel(-1)}>-1</button>
                <div className="w-12 text-center">{relation}</div>
                <button className="px-2 py-1 rounded-lg border" onClick={() => changeRel(+1)}>+1</button>
                <button className="px-2 py-1 rounded-lg border" onClick={() => changeRel(+5)}>+5</button>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white" onClick={save}>儲存</button>
                <button className="px-3 py-1.5 rounded-xl border" onClick={() => setEditing(false)}>取消</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{name}</div>
                  <div className="text-sm opacity-80">{title} · {faction}</div>
                </div>
                <div className="flex gap-2">
                  <button className="px-2 py-1 rounded-lg border" onClick={() => setEditing(true)}>編輯</button>
                  <button className="px-2 py-1 rounded-lg border" onClick={() => { if (confirm("確定刪除此 NPC？")) dispatch({ type: "DELETE_NPC", id: npc.id }); }}>刪除</button>
                </div>
              </div>
              <div className="mt-1 text-sm whitespace-pre-wrap">{notes}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="text-sm">關係：</div>
                <button className="px-2 py-1 rounded-lg border" onClick={() => dispatch({ type: "UPDATE_NPC", id: npc.id, payload: { relation: clampInt(npc.relation - 1) } })}>-1</button>
                <div className="w-10 text-center">{npc.relation}</div>
                <button className="px-2 py-1 rounded-lg border" onClick={() => dispatch({ type: "UPDATE_NPC", id: npc.id, payload: { relation: clampInt(npc.relation + 1) } })}>+1</button>
              </div>
              {relatedEvents.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer select-none text-sm">關聯事件（{relatedEvents.length}）</summary>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {relatedEvents.map(e => (<li key={e.id}>{new Date(e.date).toLocaleDateString()} · {e.title}</li>))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsPage({ state, dispatch }: { state: SaveFileV1; dispatch: React.Dispatch<Action> }) {
  const entries: { key: keyof Stats; label: string }[] = [
    { key: "reputation", label: "名譽" },
    { key: "fellowship", label: "情誼(總)" },
    { key: "estate", label: "家產" },
    { key: "decorum", label: "體面" },
    { key: "inspiration", label: "靈感" },
    { key: "wit", label: "機智" },
    { key: "experience", label: "閱歷" },
    { key: "education", label: "教養" },
    { key: "manners", label: "禮儀" },
    { key: "resolve", label: "堅定" },
    { key: "health", label: "體健" },
    { key: "rounds", label: "回合" }
  ];

  return (
    <Section title="基本數值總表">
      <div className="grid gap-2">
        {entries.map(({ key, label }) => (
          <InlineAdjust
            key={String(key)}
            label={`${label}`}
            value={state.stats[key] as number}
            onDelta={(d, reason) => dispatch({ type: "ADJUST_STAT", key, delta: d, reason })}
            highlightRound={key === "rounds"}
          />
        ))}
      </div>
    </Section>
  );
}

function SettingsPage({ state, dispatch }: { state: SaveFileV1; dispatch: React.Dispatch<Action> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [testResults, setTestResults] = useState<{ name: string; pass: boolean; detail?: string }[] | null>(null);

  const exportJson = () => {
    download(`ab-save-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')}.json`, JSON.stringify(state, null, 2));
  };
  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as SaveFileV1;
        dispatch({ type: "IMPORT_SAVE", payload: data });
      } catch (e) {
        alert("匯入失敗：JSON 格式錯誤");
      }
    };
    reader.readAsText(file);
  };

  const runUnitTests = () => {
    const results: { name: string; pass: boolean; detail?: string }[] = [];
    const ok = (name: string, pass: boolean, detail?: string) => results.push({ name, pass, detail });

    // Test 1: ADJUST_STAT updates reputation by +5
    let s1: SaveFileV1 = JSON.parse(JSON.stringify(initialSave));
    s1 = reducer(s1, { type: "ADJUST_STAT", key: "reputation", delta: 5 });
    ok("ADJUST_STAT +5 名譽", s1.stats.reputation === initialSave.stats.reputation + 5, `got ${s1.stats.reputation}`);

    // Test 2: UPDATE_STATS clamps to 999
    let s2: SaveFileV1 = JSON.parse(JSON.stringify(initialSave));
    s2 = reducer(s2, { type: "UPDATE_STATS", payload: { wit: 5000 } });
    ok("UPDATE_STATS 受 clamp 限制至 999", s2.stats.wit === 999, `got ${s2.stats.wit}`);

    // Test 3: LINK_EVENT_NPC is symmetric
    let s3: SaveFileV1 = JSON.parse(JSON.stringify(initialSave));
    const ev: EventItem = { id: "ev1", date: new Date().toISOString(), title: "t", summary: "", tags: [], npcIds: [], pinned: false };
    s3 = reducer(s3, { type: "ADD_EVENT", payload: ev });
    const npcId = s3.npcs[0].id;
    s3 = reducer(s3, { type: "LINK_EVENT_NPC", eventId: ev.id, npcId });
    const eventHasNpc = !!s3.events.find(e => e.id === ev.id)?.npcIds.includes(npcId);
    const npcHasEvent = !!s3.npcs.find(n => n.id === npcId)?.eventIds.includes(ev.id);
    ok("LINK_EVENT_NPC 對稱寫入", eventHasNpc && npcHasEvent, `eventHasNpc=${eventHasNpc}, npcHasEvent=${npcHasEvent}`);

    // Test 4: autoLogStatChange generates an event on ADJUST_STAT
    let s4: SaveFileV1 = JSON.parse(JSON.stringify(initialSave));
    s4.settings.autoLogStatChange = true;
    const beforeEvents = s4.events.length;
    s4 = reducer(s4, { type: "ADJUST_STAT", key: "estate", delta: +1, reason: "test" });
    ok("autoLogStatChange 產生事件", s4.events.length === beforeEvents + 1, `len=${s4.events.length}`);

    // Test 5: RESET returns initial baseline (check one field)
    let s5: SaveFileV1 = JSON.parse(JSON.stringify(initialSave));
    s5 = reducer(s5, { type: "ADJUST_STAT", key: "reputation", delta: 123 });
    s5 = reducer(s5, { type: "RESET" });
    ok("RESET 回到初始名譽值", s5.stats.reputation === initialSave.stats.reputation, `got ${s5.stats.reputation}`);

    setTestResults(results);
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Section title="主題與選項">
        <div className="flex items-center gap-3 mb-2">
          <Label>文風主題：</Label>
          <select className="rounded-md border px-2 py-1" value={state.meta.theme} onChange={(e) => dispatch({ type: "SET_THEME", theme: e.target.value as Theme })}>
            <option value="austen">Austen</option>
            <option value="bronte">Brontë</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input id="autoLog" type="checkbox" className="w-4 h-4" checked={state.settings.autoLogStatChange} onChange={(e) => {
            const next = { ...state, settings: { ...state.settings, autoLogStatChange: e.target.checked } } as SaveFileV1;
            dispatch({ type: "LOAD", payload: next });
          }} />
          <label htmlFor="autoLog" className="select-none">自動記錄數值變動為事件</label>
        </div>
      </Section>

      <Section title="備份與還原">
        <div className="flex flex-wrap gap-2">
          <button className="px-3 py-2 rounded-xl bg-indigo-600 text-white" onClick={exportJson}>匯出 JSON</button>
          <button className="px-3 py-2 rounded-xl border" onClick={() => fileRef.current?.click()}>匯入 JSON</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); }} />
          <button className="px-3 py-2 rounded-xl border" onClick={() => { if (confirm("確定重置為預設？這會覆蓋目前進度。")) dispatch({ type: "RESET" }); }}>重置</button>
        </div>
      </Section>

      <Section className="md:col-span-2" title="自檢與測試" right={<button className="px-3 py-1.5 rounded-xl border" onClick={runUnitTests}>執行測試</button>}>
        {!testResults && <div className="text-sm opacity-70">按「執行測試」以驗證 reducer 與關聯邏輯。</div>}
        {testResults && (
          <ul className="grid gap-2">
            {testResults.map((t, i) => (
              <li key={i} className={`rounded-lg p-2 ${t.pass ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100" : "bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-100"}`}>
                <div className="font-medium">{t.pass ? "✅" : "❌"} {t.name}</div>
                {t.detail && <div className="text-xs opacity-80 mt-1">{t.detail}</div>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
