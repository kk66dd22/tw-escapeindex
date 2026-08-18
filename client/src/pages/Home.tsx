/**
 * Style reminder: 夜蝕都市 Neo-noir editorial；煤黑、氧化金、冷霧藍、案件檔案資訊層。
 */
import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, Compass, Crosshair, ExternalLink, MapPin, Search, ShieldAlert, Sparkles, Star, Users, X } from "lucide-react";
import venues from "../../../data/venues.json";

type Filter = "all" | "2-4" | "5-plus" | "beginner" | "brainy" | "horror" | "puzzle";
const filters: { id: Filter; label: string; icon?: string }[] = [
  { id: "all", label: "全部案件" }, { id: "2-4", label: "2–4 人" }, { id: "5-plus", label: "5 人以上" },
  { id: "beginner", label: "新手入門" }, { id: "brainy", label: "重度燒腦" }, { id: "horror", label: "恐怖驚悚" }, { id: "puzzle", label: "機關解謎" },
];

function ratingLabel(rating: number | null) { return rating ? rating.toFixed(1) : "待核對"; }
function matchesPlayers(value: string, filter: Filter) {
  const max = Number(value.split("–")[1] ?? value.split("-")[1] ?? 99);
  return filter === "2-4" ? max <= 4 : filter === "5-plus" ? max >= 5 : true;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Filter>("all");
  const [showSources, setShowSources] = useState(false);
  const filtered = useMemo(() => venues.filter((venue) => {
    const q = query.toLowerCase().trim();
    const haystack = [venue.name, venue.district, venue.address, ...venue.themes.flatMap((theme) => [theme.name, ...theme.styles])].join(" ").toLowerCase();
    const textMatch = !q || haystack.includes(q);
    const themeMatch = active === "beginner"
      ? venue.themes.some((theme) => theme.players.startsWith("2") && theme.brain <= 3)
      : active === "brainy"
        ? venue.themes.some((theme) => theme.brain >= 4)
        : active === "horror"
          ? venue.themes.some((theme) => theme.horror >= 4)
          : active === "puzzle"
            ? venue.themes.some((theme) => theme.styles.includes("機關解謎"))
            : active === "all" || venue.themes.some((theme) => matchesPlayers(theme.players, active));
    return textMatch && themeMatch;
  }), [query, active]);

  return <div className="min-h-screen bg-[#0c0e0d] text-[#e8e4db] selection:bg-[#c89b5c] selection:text-[#0c0e0d]">
    <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.06] [background-image:linear-gradient(rgba(200,155,92,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(200,155,92,.35)_1px,transparent_1px)] [background-size:54px_54px]" />
    <header className="relative z-10 border-b border-white/10 bg-[#0c0e0d]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 lg:px-10">
        <a href="#top" className="flex items-center gap-3"><img src="/manus-storage/brand-sigil_8091f515.png" className="h-10 w-10 object-contain" alt="裂門案件庫圖騰" /><span className="font-mono text-[11px] uppercase tracking-[.3em] text-[#c89b5c]">The Escape Index<br /><b className="font-sans text-sm tracking-[.16em] text-[#e8e4db]">台北密室案件庫</b></span></a>
        <nav className="hidden items-center gap-8 font-mono text-[10px] uppercase tracking-[.2em] text-white/50 md:flex"><a href="#catalog" className="transition-colors hover:text-[#c89b5c]">案件目錄</a><a href="#method" className="transition-colors hover:text-[#c89b5c]">評比方法</a><a href="#sources" className="transition-colors hover:text-[#c89b5c]">資料來源</a></nav>
        <div className="font-mono text-[10px] tracking-widest text-white/40">FILE 002 / 2026</div>
      </div>
    </header>

    <main id="top" className="relative z-10">
      <section className="relative overflow-hidden border-b border-white/10">
        <img src="/manus-storage/hero-night-alley_363700f4.png" alt="夜晚台北巷弄中的神秘入口" className="absolute inset-0 h-full w-full object-cover opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c0e0d] via-[#0c0e0d]/75 to-transparent" />
        <div className="mx-auto grid min-h-[600px] max-w-[1400px] items-end gap-12 px-5 pb-16 pt-20 lg:grid-cols-[1fr_360px] lg:px-10 lg:pb-24">
          <div className="relative max-w-3xl"><div className="mb-7 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[.3em] text-[#c89b5c]"><span className="h-px w-10 bg-[#c89b5c]" /> Taipei / Field Guide 02</div><h1 className="font-serif text-5xl font-black leading-[.98] tracking-tight text-[#f3efe7] sm:text-7xl lg:text-[92px]">今晚，<br /><em className="font-normal text-[#c89b5c]">哪一扇門？</em></h1><p className="mt-8 max-w-xl text-base leading-8 text-white/70 sm:text-lg">把零散的心得、恐怖程度與燒腦指數，整理成一份真正能幫你做決定的台北密室逃脫案件庫。</p><div className="relative mt-10 max-w-xl"><Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#c89b5c]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋店家、主題、風格或區域..." className="w-full border border-[#c89b5c]/60 bg-[#0c0e0d]/80 py-4 pl-14 pr-12 font-sans text-sm text-white outline-none backdrop-blur-sm transition focus:border-[#c89b5c] focus:ring-1 focus:ring-[#c89b5c]" />{query && <button onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"><X size={16} /></button>}</div></div>
          <aside className="hidden border-l border-[#c89b5c]/50 pl-7 lg:block"><div className="mb-10 font-mono text-[10px] uppercase tracking-[.25em] text-white/40">Index / Snapshot</div><div className="space-y-7 font-mono"><div><div className="text-4xl text-[#c89b5c]">05</div><div className="mt-1 text-[10px] uppercase tracking-widest text-white/45">Verified venues</div></div><div><div className="text-4xl text-[#c89b5c]">15+</div><div className="mt-1 text-[10px] uppercase tracking-widest text-white/45">Themes catalogued</div></div><div><div className="flex items-center gap-2 text-4xl text-[#c89b5c]"><Crosshair size={29} /> 7</div><div className="mt-1 text-[10px] uppercase tracking-widest text-white/45">Decision filters</div></div></div></aside>
        </div>
      </section>

      <section className="sticky top-0 z-20 border-b border-white/10 bg-[#111412]/95 backdrop-blur-xl"><div className="mx-auto flex max-w-[1400px] items-center gap-3 overflow-x-auto px-5 py-4 lg:px-10"><span className="mr-3 shrink-0 font-mono text-[10px] uppercase tracking-[.25em] text-[#c89b5c]">Trace /</span>{filters.map((filter) => <button key={filter.id} onClick={() => setActive(filter.id)} className={`shrink-0 border px-4 py-2 font-mono text-[10px] uppercase tracking-wider transition ${active === filter.id ? "border-[#c89b5c] bg-[#c89b5c] text-[#0c0e0d]" : "border-white/15 text-white/55 hover:border-[#c89b5c]/70 hover:text-[#c89b5c]"}`}>{filter.id === "all" ? "全部檔案" : filter.id === "2-4" ? "鎖定 2–4 人" : filter.id === "5-plus" ? "鎖定 5 人+" : filter.id === "beginner" ? "新手線索" : filter.id === "brainy" ? "燒腦警示" : filter.id === "horror" ? "恐怖警示" : "機關線索"}</button>)}<span className="ml-auto hidden shrink-0 font-mono text-[10px] text-white/40 sm:block">{filtered.length.toString().padStart(2, "0")} FILES MATCHED</span></div></section>

      <section id="catalog" className="mx-auto max-w-[1400px] px-5 py-20 lg:px-10 lg:py-28"><div className="mb-14 flex items-end justify-between gap-5"><div><div className="mb-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[.3em] text-[#5e8b92]"><span className="h-px w-8 bg-[#5e8b92]" /> Field notes</div><h2 className="font-serif text-4xl font-bold text-[#f3efe7] sm:text-5xl">五個值得先查的<br /><span className="text-white/45">入口。</span></h2></div><div className="hidden text-right font-mono text-[10px] leading-6 tracking-wider text-white/35 sm:block">LAST INDEXED<br />18 AUG 2026 / TAIPEI</div></div>
        {filtered.length === 0 ? <div className="border border-dashed border-white/20 py-24 text-center"><Compass className="mx-auto mb-5 text-[#c89b5c]" size={30} /><p className="font-serif text-2xl">沒有符合線索的案件</p><button onClick={() => { setActive("all"); setQuery(""); }} className="mt-5 font-mono text-xs uppercase tracking-widest text-[#c89b5c] underline underline-offset-4">清除線索</button></div> : <div className="grid gap-6 md:grid-cols-12">{filtered.map((venue, index) => <VenueCard key={venue.id} venue={venue} index={index} />)}</div>}
      </section>

      <section id="method" className="border-y border-white/10 bg-[#111412] py-20"><div className="mx-auto grid max-w-[1400px] gap-12 px-5 lg:grid-cols-[.8fr_1.2fr] lg:px-10"><div><div className="mb-4 font-mono text-[10px] uppercase tracking-[.3em] text-[#c89b5c]">01 / Method</div><h2 className="font-serif text-4xl font-bold">不是排名。<br /><span className="text-white/45">是匹配。</span></h2></div><div className="grid gap-8 sm:grid-cols-3"><div><Users className="mb-5 text-[#c89b5c]" size={20} /><h3 className="mb-2 font-bold">先看隊伍</h3><p className="text-sm leading-7 text-white/45">人數、經驗與膽量，先於「熱門」二字。</p></div><div><ShieldAlert className="mb-5 text-[#c89b5c]" size={20} /><h3 className="mb-2 font-bold">拆開難度</h3><p className="text-sm leading-7 text-white/45">恐怖不等於燒腦，兩條軸線分開比較。</p></div><div><Sparkles className="mb-5 text-[#c89b5c]" size={20} /><h3 className="mb-2 font-bold">直達官方</h3><p className="text-sm leading-7 text-white/45">每張卡都連到官方頁面，自己核對檔期與票價。</p></div></div></div></section>
      <section id="sources" className="mx-auto max-w-[1400px] px-5 py-10 lg:px-10"><button onClick={() => setShowSources(!showSources)} className="flex w-full items-center justify-between border-b border-white/10 py-5 text-left font-mono text-xs uppercase tracking-[.2em] text-white/60 hover:text-[#c89b5c]"><span>資料來源與更新說明</span>{showSources ? <ChevronDown className="rotate-180" size={16} /> : <ChevronDown size={16} />}</button>{showSources && <div className="grid gap-4 py-6 text-xs leading-6 text-white/45 md:grid-cols-2"><p>店家地址、官方主題與預約入口來自各品牌公開網站；星等欄位優先採公開頁面引用的 Google 評論快照，無法穩定核對者明確標示「待核對」。</p><p>本頁是獨立導覽與導流原型，不代表店家排名、官方背書或保證優惠。優缺點與難度為整理後的導覽標籤，實際體驗請以店家最新資訊為準。</p></div>}</section>
    </main><footer className="border-t border-white/10 px-5 py-8 lg:px-10"><div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-4 font-mono text-[10px] uppercase tracking-[.2em] text-white/35 sm:flex-row"><span>© 2026 The Escape Index / Taipei</span><span>Built for curious teams</span></div></footer>
  </div>;
}

function VenueCard({ venue, index }: { venue: typeof venues[number]; index: number }) {
  const image = index % 3 === 0 ? "/manus-storage/card-archival-room_28840e3c.png" : index % 3 === 1 ? "/manus-storage/card-ritual-basement_7b06bae4.png" : "/manus-storage/card-clockwork-lab_7ed1438f.png";
  return <article className={`group relative overflow-hidden border border-white/10 bg-[#151917] transition duration-300 hover:-translate-y-1 hover:border-[#c89b5c]/70 ${index === 0 ? "md:col-span-7 md:row-span-2" : index === 1 ? "md:col-span-5" : index === 2 ? "md:col-span-5 md:translate-y-8" : index === 3 ? "md:col-span-5" : "md:col-span-7 md:-translate-y-6"}`}><div className={`relative overflow-hidden ${index === 0 ? "h-64" : "h-48"}`}><div className="pointer-events-none absolute right-4 top-1/2 z-10 h-16 w-16 -translate-y-1/2 rounded-full border border-[#c89b5c]/25"><span className="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2 bg-[#c89b5c]/45" /><span className="absolute left-1/2 top-1/2 h-px w-1/2 -translate-y-1/2 bg-[#c89b5c]/45" /></div><img src={image} alt="" className="h-full w-full object-cover opacity-65 grayscale-[.2] transition duration-500 group-hover:scale-[1.03] group-hover:opacity-85" /><div className="absolute inset-0 bg-gradient-to-t from-[#151917] via-transparent to-transparent" /><span className="absolute left-4 top-4 border border-[#c89b5c]/60 bg-[#0c0e0d]/80 px-2 py-1 font-mono text-[9px] tracking-[.2em] text-[#c89b5c]">CASE {String(index + 1).padStart(2, "0")}</span><span className="absolute right-4 top-4 bg-[#0c0e0d]/80 px-2 py-1 font-mono text-[9px] tracking-widest text-white/60">{venue.district}</span></div><div className="p-5 pt-3"><div className="flex items-start justify-between gap-3"><h3 className="font-serif text-2xl font-bold text-[#f3efe7]">{venue.name}</h3><div className="flex shrink-0 items-center gap-1 font-mono text-xs text-[#c89b5c]"><Star size={13} fill="currentColor" />{ratingLabel(venue.google_rating)}</div></div><div className="mt-2 flex items-start gap-2 text-xs text-white/40"><MapPin size={13} className="mt-0.5 shrink-0" />{venue.address}</div><div className="mt-5 space-y-3">{venue.themes.slice(0, 3).map((theme) => <div key={theme.name} className="border-l border-[#5e8b92] pl-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-white/80">{theme.name}</span><span className="font-mono text-[10px] text-white/35">{theme.players}</span></div><div className="mt-1 flex flex-wrap gap-1">{theme.styles.map((style) => <span key={style} className="bg-[#202925] px-2 py-1 font-mono text-[9px] text-[#9fbab5]">{style}</span>)}<span className="px-2 py-1 font-mono text-[9px] text-[#c89b5c]">恐怖 {"●".repeat(theme.horror)}{"○".repeat(5-theme.horror)}</span></div></div>)}</div><div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-xs"><div><div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-[#8bb2b4]">Evidence / plus</div><p className="leading-5 text-white/55">{venue.pros[0]}</p></div><div><div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-[#bd7666]">Evidence / caution</div><p className="leading-5 text-white/55">{venue.cons[0]}</p></div></div><a href={venue.booking_url} target="_blank" rel="noreferrer" className="mt-6 flex items-center justify-between bg-[#c89b5c] px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-wider text-[#0c0e0d] transition hover:bg-[#e0bd83] active:scale-[.98]">核對官方檔期與優惠<ExternalLink size={15} /></a></div></article>;
}
