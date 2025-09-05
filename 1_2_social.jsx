import React, { useMemo, useState, useEffect } from "react";

// －－－－ 資料庫（六上 1-2：中央與地方政府）－－－－
// 精簡、去爭議版本，符合六年級程度
const CENTRAL = [
  {
    key: "president",
    name: "總統",
    scope: "中央",
    bullets: [
      "國家元首、統帥三軍",
      "公布法律、發布命令",
      "任命行政院院長等重要職務",
      "對外代表國家"
    ],
    dutyShort: "公布法律、任命行政院長、統帥三軍"
  },
  {
    key: "ey",
    name: "行政院",
    scope: "中央",
    bullets: [
      "推動國家政策與行政事務",
      "統籌各部會（教育、交通、衛福等）",
      "提出法案與中央預算案"
    ],
    dutyShort: "推動政策與行政、統籌各部會"
  },
  {
    key: "ly",
    name: "立法院",
    scope: "中央",
    bullets: [
      "制定與修正法律",
      "審查中央政府總預算",
      "監督行政、質詢官員"
    ],
    dutyShort: "制定法律、審查預算、監督行政"
  },
  {
    key: "jy",
    name: "司法院",
    scope: "中央",
    bullets: [
      "統一解釋法律與命令",
      "憲法審查（大法官職權）",
      "法院審判，保障人民權利"
    ],
    dutyShort: "解釋憲法與法律、審判保障權利"
  },
  {
    key: "eyx",
    name: "考試院",
    scope: "中央",
    bullets: [
      "辦理公務人員考試",
      "銓敘任用、俸給與保障相關事項"
    ],
    dutyShort: "公務人員考選與銓敘"
  },
  {
    key: "cy",
    name: "監察院",
    scope: "中央",
    bullets: [
      "監察政府、糾正與彈劾",
      "辦理國家審計（審計部）"
    ],
    dutyShort: "監察政府、彈劾糾正、審計"
  }
];

const LOCAL = [
  {
    key: "county-city-gov",
    name: "縣市政府",
    scope: "地方",
    bullets: [
      "辦理地方自治事務（道路、公園、環保等）",
      "教育、社會福利、衛生等地方業務",
      "執行議會通過之預算與自治法規"
    ],
    dutyShort: "推動地方行政與建設、服務民眾"
  },
  {
    key: "county-city-council",
    name: "縣市議會",
    scope: "地方",
    bullets: [
      "制定自治法規",
      "審議地方預算",
      "監督地方政府、質詢首長"
    ],
    dutyShort: "制定自治法規、審議預算、監督政府"
  }
];

const ALL_ITEMS = [...CENTRAL, ...LOCAL];

// 讓配對更明確：為每個機關建立一對「名稱卡」與「職掌卡」
function buildPairs(fromKeys) {
  return fromKeys.map((item) => ({
    id: item.key,
    name: item.name,
    duty: item.dutyShort
  }));
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// －－－－ UI 元件 －－－－
function Tag({ children }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 border border-slate-200">{children}</span>
  );
}

function Section({ title, subtitle, children, right }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" className="peer hidden" checked={checked} onChange={(e)=>onChange(e.target.checked)} />
      <span className="w-10 h-6 rounded-full bg-slate-200 peer-checked:bg-emerald-500 relative transition-all">
        <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all peer-checked:left-4"/>
      </span>
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

function Button({ children, onClick, variant = "default" }) {
  const base = "px-3 py-2 rounded-xl text-sm font-medium transition-all";
  const styles = {
    default: "bg-slate-900 text-white hover:bg-slate-800",
    ghost: "bg-transparent border border-slate-300 hover:bg-slate-50",
    subtle: "bg-slate-100 text-slate-800 hover:bg-slate-200"
  };
  return (
    <button onClick={onClick} className={`${base} ${styles[variant]}`}>
      {children}
    </button>
  );
}

// －－－－ 知識區 －－－－
function KnowledgeZone() {
  const [showLocal, setShowLocal] = useState(true);
  const [showCentral, setShowCentral] = useState(true);

  const filtered = useMemo(() => {
    return ALL_ITEMS.filter((x) => (x.scope === "中央" ? showCentral : showLocal));
  }, [showCentral, showLocal]);

  return (
    <Section
      title="知識區：誰是誰？做什麼？"
      subtitle="純列出機關與主要工作執掌，可作為學生自學或老師講述用"
      right={
        <div className="flex items-center gap-3">
          <Toggle checked={showCentral} onChange={setShowCentral} label="顯示中央" />
          <Toggle checked={showLocal} onChange={setShowLocal} label="顯示地方" />
        </div>
      }
    >
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((item) => (
          <div key={item.key} className="border border-slate-200 rounded-xl p-4 bg-gradient-to-b from-white to-slate-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">{item.name}</h3>
              <Tag>{item.scope}</Tag>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
              {item.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

// －－－－ 教學區（配對：名稱 ↔ 工作執掌） －－－－
function TeachingZone() {
  const [pool, setPool] = useState(() => shuffle(ALL_ITEMS));
  const [answers, setAnswers] = useState({}); // key -> dutyShort
  const [checked, setChecked] = useState(false);

  const dutyOptions = useMemo(() => shuffle(ALL_ITEMS.map((x) => x.dutyShort)), []);

  function reset() {
    setPool(shuffle(ALL_ITEMS));
    setAnswers({});
    setChecked(false);
  }

  const correctCount = useMemo(() => {
    return pool.reduce((acc, item) => acc + (answers[item.key] === item.dutyShort ? 1 : 0), 0);
  }, [answers, pool]);

  return (
    <Section
      title="教學區：簡易配對練習"
      subtitle="從下拉選單為每個機關選出正確的工作執掌。"
      right={
        <div className="flex items-center gap-2">
          <Button variant="subtle" onClick={reset}>重抽題目</Button>
          <Button onClick={() => setChecked(true)}>批改</Button>
        </div>
      }
    >
      <div className="text-sm text-slate-600 mb-3">已正確：{correctCount}／{pool.length}</div>
      <div className="space-y-3">
        {pool.map((item) => {
          const value = answers[item.key] ?? "";
          const isCorrect = value && value === item.dutyShort;
          const isWrong = checked && value && value !== item.dutyShort;
          return (
            <div key={item.key} className={`p-3 rounded-xl border ${isCorrect ? "border-emerald-400 bg-emerald-50" : isWrong ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`}>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <Tag>{item.scope}</Tag>
                  <span className="font-medium">{item.name}</span>
                </div>
                <select
                  className="mt-1 md:mt-0 w-full md:w-[520px] border border-slate-300 rounded-lg p-2 text-sm"
                  value={value}
                  onChange={(e) => setAnswers((s) => ({ ...s, [item.key]: e.target.value }))}
                >
                  <option value="" disabled>— 選出對應的工作執掌 —</option>
                  {dutyOptions.map((opt, i) => (
                    <option key={i} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              {checked && isWrong && (
                <div className="text-xs text-slate-600 mt-2">
                  正解：<span className="font-medium">{item.dutyShort}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// －－－－ 翻牌區（記憶配對） －－－－
function MemoryZone() {
  const [useCentral, setUseCentral] = useState(true);
  const [useLocal, setUseLocal] = useState(true);
  const [pairCount, setPairCount] = useState(8); // 預設 8 對（16 張）

  const availableKeys = useMemo(() => {
    const list = ALL_ITEMS.filter((x) => (x.scope === "中央" ? useCentral : useLocal));
    return list.map((x) => x.key);
  }, [useCentral, useLocal]);

  const [pairs, setPairs] = useState(() => buildPairs(ALL_ITEMS.map(x => x)));
  const [deck, setDeck] = useState([]);
  const [flipped, setFlipped] = useState([]); // 目前翻開但未配對的 index 陣列
  const [matchedIds, setMatchedIds] = useState(new Set());
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);

  function setup() {
    // 從可用清單中挑 pairCount 對
    const pool = ALL_ITEMS.filter((x) => availableKeys.includes(x.key));
    const chosen = shuffle(pool).slice(0, Math.min(pairCount, pool.length));
    const pairObjs = buildPairs(chosen);
    setPairs(pairObjs);

    // 建立牌堆（兩張一對：名稱卡、職掌卡）
    const cards = [];
    pairObjs.forEach((p) => {
      cards.push({ kind: "name", pairId: p.id, label: p.name });
      cards.push({ kind: "duty", pairId: p.id, label: p.duty });
    });
    const s = shuffle(cards).map((c, idx) => ({ ...c, idx }));
    setDeck(s);
    setFlipped([]);
    setMatchedIds(new Set());
    setMoves(0);
    setLocked(false);
  }

  useEffect(() => {
    setup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCentral, useLocal, pairCount]);

  function onFlip(idx) {
    if (locked) return;
    if (flipped.includes(idx)) return;
    const card = deck[idx];
    if (matchedIds.has(card.pairId)) return; // 已配對

    const nf = [...flipped, idx];
    setFlipped(nf);

    if (nf.length === 2) {
      setLocked(true);
      setMoves((m) => m + 1);
      const [a, b] = nf.map((i) => deck[i]);
      const isMatch = a.pairId === b.pairId && a.kind !== b.kind;
      setTimeout(() => {
        if (isMatch) {
          const nm = new Set(matchedIds);
          nm.add(a.pairId);
          setMatchedIds(nm);
        }
        setFlipped([]);
        setLocked(false);
      }, 700);
    }
  }

  const finished = matchedIds.size === pairs.length && pairs.length > 0;

  return (
    <Section
      title="翻牌區：記憶配對（名稱 ↔ 職掌）"
      subtitle="把『機關名稱』與『主要工作』配成一對。"
      right={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={setup}>重新洗牌</Button>
          <Button onClick={setup}>重新開始</Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <Toggle checked={useCentral} onChange={setUseCentral} label="包含中央" />
        <Toggle checked={useLocal} onChange={setUseLocal} label="包含地方" />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-700">配對組數</span>
          <input
            type="range" min={4} max={12} step={1}
            value={pairCount}
            onChange={(e) => setPairCount(parseInt(e.target.value))}
          />
          <span className="w-10 text-center font-medium">{pairCount}</span>
        </div>
        <div className="text-sm text-slate-600">步數：<span className="font-medium">{moves}</span></div>
        <div className="text-sm text-slate-600">進度：<span className="font-medium">{matchedIds.size}／{pairs.length}</span></div>
      </div>

      {finished ? (
        <div className="p-6 border border-emerald-300 bg-emerald-50 rounded-2xl text-emerald-800">
          🎉 太棒了！你已完成全部 {pairs.length} 對配對（共 {pairs.length * 2} 張卡），總步數 {moves}。
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {deck.map((card, i) => {
            const isFaceUp = flipped.includes(i) || matchedIds.has(card.pairId);
            return (
              <button
                key={i}
                onClick={() => onFlip(i)}
                className={`aspect-[3/4] rounded-2xl border relative overflow-hidden transition-all ${
                  isFaceUp ? "bg-white border-emerald-300 shadow-sm" : "bg-slate-800 border-slate-700"
                }`}
                disabled={matchedIds.has(card.pairId)}
                aria-label="卡片"
              >
                {isFaceUp ? (
                  <div className="absolute inset-0 p-3 flex items-center justify-center text-center">
                    <div>
                      <div className="text-xs mb-1 text-slate-500">{card.kind === "name" ? "機關名稱" : "主要工作"}</div>
                      <div className="text-sm font-medium leading-snug">
                        {card.label}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-slate-700" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// －－－－ Tabs 容器 －－－－
function Tabs({ tabs, value, onChange }) {
  return (
    <div>
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`px-3 py-2 rounded-xl text-sm border transition-all ${
              value === t.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{tabs.find((t) => t.key === value)?.content}</div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("k");
  const tabs = [
    { key: "k", label: "知識區", content: <KnowledgeZone /> },
    { key: "t", label: "教學區", content: <TeachingZone /> },
    { key: "m", label: "翻牌區", content: <MemoryZone /> }
  ];

  return (
    <div className="min-h-screen bg-slate-100 p-5">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold">1-2 中央政府 × 地方政府｜翻牌配對學習站</h1>
          <p className="text-slate-600 mt-1 text-sm md:text-base">
            區分中央（五院＋總統）與地方（縣市政府＋議會），依序進行：知識學習 → 配對練習 → 翻牌記憶。
          </p>
        </header>

        <Tabs tabs={tabs} value={tab} onChange={setTab} />

        <footer className="mt-8 text-xs text-slate-500">
          教學用途示範版｜可於課堂投影或學生自學使用。資料為六年級程度之精簡敘述。
        </footer>
      </div>
    </div>
  );
}
