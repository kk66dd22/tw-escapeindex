/**
 * Style: 夜蝕都市 Neo-noir editorial；煤黑、氧化金、冷霧藍。
 * Content model: 一張卡片 = 一個可被比較、收藏與預約的密室主題。
 */
import { FAVORITES_STORAGE_KEY, parseFavoriteIds, serializeFavoriteIds, toggleFavoriteId } from "@/lib/favorites";
import {
  ArrowDownUp,
  ArrowUp,
  Brain,
  Check,
  Clock3,
  Compass,
  ExternalLink,
  Flame,
  Heart,
  Search,
  Star,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import topics from "../../../data/topics.json";

type Filter = "all" | "2-4" | "5-plus" | "beginner" | "brainy" | "horror" | "puzzle";
type SortMode = "rating" | "horror" | "brain";

const PAGE_SIZE = 10;
const cityFilters = ["全台", "台北市", "台中市", "嘉義市", "台南市", "高雄市"] as const;
const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "全部主題" },
  { id: "2-4", label: "2–4 人" },
  { id: "5-plus", label: "5 人以上" },
  { id: "beginner", label: "新手入門" },
  { id: "brainy", label: "重度燒腦" },
  { id: "horror", label: "恐怖驚悚" },
  { id: "puzzle", label: "機關解謎" },
];

function playerBounds(value: string) {
  const values = value.match(/\d+/g)?.map(Number) ?? [];
  return { min: values[0] ?? null, max: values.at(-1) ?? null };
}

function playerLabel(value: string) {
  return /\d/.test(value) ? `${value}人` : "依官網公告";
}

function matchesFilter(topic: (typeof topics)[number], filter: Filter) {
  const { max } = playerBounds(topic.players);
  if (filter === "beginner") return max !== null && max <= 6 && (topic.brain ?? 5) <= 3;
  if (filter === "brainy") return (topic.brain ?? 0) >= 4;
  if (filter === "horror") return (topic.horror ?? 0) >= 4;
  if (filter === "puzzle") return topic.styles.some((style) => style.includes("機關") || style.includes("解謎"));
  if (filter === "2-4") return max !== null && max <= 4;
  if (filter === "5-plus") return max !== null && max >= 5;
  return true;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Filter[]>([]);
  const [activeCity, setActiveCity] = useState<string>("全台");
  const [sortMode, setSortMode] = useState<SortMode>("rating");
  const [page, setPage] = useState(1);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : parseFavoriteIds(window.localStorage.getItem(FAVORITES_STORAGE_KEY)),
  );
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const catalogGridRef = useRef<HTMLDivElement>(null);
  const shouldScrollToGrid = useRef(false);

  const filtered = useMemo(() => {
    const matched = topics.filter((topic) => {
      const q = query.toLowerCase().trim();
      const haystack = [topic.name, topic.venue_name, topic.city, topic.district, ...topic.styles].join(" ").toLowerCase();
      const textMatch = !q || haystack.includes(q);
      const cityMatch = activeCity === "全台" || topic.city === activeCity;
      const filterMatch = activeFilters.every((filter) => matchesFilter(topic, filter));
      const favoriteMatch = !showFavoritesOnly || favoriteIds.has(topic.id);
      return textMatch && cityMatch && filterMatch && favoriteMatch;
    });

    return [...matched].sort((a, b) => {
      const aValue = sortMode === "rating" ? (a.google_rating ?? -1) : sortMode === "horror" ? (a.horror ?? -1) : (a.brain ?? -1);
      const bValue = sortMode === "rating" ? (b.google_rating ?? -1) : sortMode === "horror" ? (b.horror ?? -1) : (b.brain ?? -1);
      return bValue - aValue;
    });
  }, [query, activeFilters, activeCity, sortMode, favoriteIds, showFavoritesOnly]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleTopics = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => setPage(1), [query, activeFilters, activeCity, sortMode, showFavoritesOnly]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, serializeFavoriteIds(favoriteIds));
  }, [favoriteIds]);
  useEffect(() => {
    if (!shouldScrollToGrid.current) return;
    shouldScrollToGrid.current = false;
    window.requestAnimationFrame(() => catalogGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [page]);
  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 520);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleFilter = (filter: Filter) => {
    setActiveFilters((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter],
    );
  };
  const toggleFavorite = (topicId: string) => setFavoriteIds((current) => toggleFavoriteId(current, topicId));
  const goToPage = (targetPage: number) => {
    const nextPage = Math.min(pageCount, Math.max(1, targetPage));
    if (nextPage === page) return;
    shouldScrollToGrid.current = true;
    setPage(nextPage);
  };
  const clearFilters = () => {
    setActiveFilters([]);
    setActiveCity("全台");
    setQuery("");
    setShowFavoritesOnly(false);
  };

  return (
    <div className="min-h-screen bg-[#0c0e0d] text-[#e8e4db] selection:bg-[#c89b5c] selection:text-[#0c0e0d]">
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.06] [background-image:linear-gradient(rgba(200,155,92,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(200,155,92,.35)_1px,transparent_1px)] [background-size:54px_54px]" />
      <header className="relative z-10 border-b border-white/10 bg-[#0c0e0d]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 lg:px-10">
          <a href="#top" className="flex items-center gap-3">
            <img src="/manus-storage/brand-sigil_8091f515.png" className="h-10 w-10 object-contain" alt="全台密室逃脫案件庫裂門圖騰" />
            <span className="font-mono text-xs uppercase tracking-[.3em] text-[#c89b5c] sm:text-sm">
              The Escape Index<br />
              <b className="font-sans text-sm tracking-[.16em] text-[#e8e4db]">全台密室逃脫案件庫</b>
            </span>
          </a>
          <nav className="hidden items-center gap-8 font-mono text-xs uppercase tracking-[.2em] text-white/50 sm:text-sm md:flex">
            <a href="#catalog" className="hover:text-[#c89b5c]">主題目錄</a>
            <a href="#method" className="hover:text-[#c89b5c]">評比方法</a>
          </nav>
          <div className="font-mono text-xs tracking-widest text-white/40 sm:text-sm">ROOM FILE / 03</div>
        </div>
      </header>

      <main id="top" className="relative z-10">
        <section className="relative overflow-hidden border-b border-white/10">
          <img src="/manus-storage/hero-night-alley_363700f4.png" alt="夜晚台灣城市巷弄中的神秘入口" className="absolute inset-0 h-full w-full object-cover opacity-55" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0c0e0d] via-[#0c0e0d]/80 to-transparent" />
          <div className="mx-auto grid min-h-[600px] max-w-[1400px] items-end gap-12 px-5 pb-16 pt-20 lg:grid-cols-[1fr_360px] lg:px-10 lg:pb-24">
            <div className="relative max-w-3xl">
              <div className="mb-7 flex items-center gap-3 font-mono text-xs uppercase tracking-[.3em] text-[#c89b5c] sm:text-sm">
                <span className="h-px w-10 bg-[#c89b5c]" /> 台灣密室逃脫／主題索引 03
              </div>
              <h1 className="font-serif text-5xl font-black leading-[.98] tracking-tight text-[#f3efe7] sm:text-7xl lg:text-[92px]">
                先選一場，<br /><em className="font-normal text-[#c89b5c]">再決定去哪裡。</em>
              </h1>
              <p className="mt-8 max-w-xl text-base leading-8 text-white/70 sm:text-lg">
                別急著先找店家，先挑出今晚真正想玩的主題。全台 {topics.length} 場高評價密室，讓你一次比清楚。
              </p>
            </div>
            <aside className="hidden border-l border-[#c89b5c]/50 pl-7 lg:block">
              <div className="mb-10 font-mono text-xs uppercase tracking-[.25em] text-white/40 sm:text-sm">資料快照</div>
              <div className="space-y-7 font-mono">
                <Stat value={topics.length} label="收錄主題" />
                <Stat value="05" label="收錄城市" />
                <Stat value="07" label="篩選條件" />
              </div>
            </aside>
          </div>
        </section>

        <section className="sticky top-0 z-20 border-b border-white/10 bg-[#111412]/95 backdrop-blur-xl">
          <div className="mx-auto flex w-full min-w-0 max-w-none items-center gap-3 overflow-x-auto px-4 py-4 lg:px-8">
            <span className="mr-2 shrink-0 font-mono text-xs uppercase tracking-[.25em] text-[#c89b5c] sm:text-sm">地區／</span>
            <div className="flex shrink-0 items-center gap-1 border-r border-white/10 pr-4">
              {cityFilters.map((city) => (
                <button key={city} onClick={() => setActiveCity(city)} className={`shrink-0 px-2 py-2 font-mono text-xs tracking-wider transition sm:text-sm ${activeCity === city ? "text-[#c89b5c]" : "text-white/45 hover:text-white"}`}>
                  {city === "全台" ? city : city.replace("市", "")}
                </button>
              ))}
            </div>
            <span className="mr-2 shrink-0 font-mono text-xs uppercase tracking-[.25em] text-[#c89b5c] sm:text-sm">主題／</span>
            {filters.map((filter) => (
              <button key={filter.id} onClick={() => filter.id === "all" ? setActiveFilters([]) : toggleFilter(filter.id)} className={`shrink-0 border px-4 py-2 font-mono text-xs transition sm:text-sm ${(filter.id === "all" ? activeFilters.length === 0 : activeFilters.includes(filter.id)) ? "border-[#c89b5c] bg-[#c89b5c] text-[#0c0e0d]" : "border-white/15 text-white/55 hover:border-[#c89b5c]/70 hover:text-[#c89b5c]"}`}>
                {filter.label}
              </button>
            ))}
            <button id="favorites-filter" type="button" aria-pressed={showFavoritesOnly} onClick={() => setShowFavoritesOnly((current) => !current)} className={`flex shrink-0 items-center gap-2 border px-4 py-2 font-mono text-xs transition sm:text-sm ${showFavoritesOnly ? "border-rose-400 bg-rose-400/15 text-rose-300" : "border-white/15 text-white/55 hover:border-rose-400/70 hover:text-rose-300"}`}>
              <Heart size={14} fill={showFavoritesOnly ? "currentColor" : "none"} /> 我的最愛 {favoriteIds.size}
            </button>
            <div className="ml-0 flex shrink-0 items-center gap-2 border-l border-white/10 pl-3">
              <ArrowDownUp size={13} className="text-[#c89b5c]" />
              <label htmlFor="room-sort" className="sr-only">排序主題</label>
              <select id="room-sort" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="appearance-none border border-white/15 bg-[#151917] px-3 py-2 font-mono text-xs text-white/70 outline-none transition hover:border-[#c89b5c]/70 focus:border-[#c89b5c] sm:text-sm">
                <option value="rating">評分最高</option>
                <option value="horror">恐怖指數最高</option>
                <option value="brain">燒腦程度最高</option>
              </select>
            </div>
            <span className="hidden shrink-0 font-mono text-xs text-white/40 sm:block sm:text-sm">共找到 {filtered.length} 個主題</span>
          </div>
        </section>

        <section id="catalog" className="mx-auto w-full max-w-none px-4 py-20 lg:px-8 lg:py-28">
          <div className="mb-14 flex items-end justify-between gap-5">
            <div>
              <div className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[.3em] text-[#5e8b92] sm:text-sm"><span className="h-px w-8 bg-[#5e8b92]" /> 主題檔案</div>
              <h2 className="font-serif text-4xl font-bold text-[#f3efe7] sm:text-5xl">每一場，單獨比較。<br /><span className="text-white/45">找到你的今晚。</span></h2>
            </div>
            <div className="hidden text-right font-mono text-xs leading-6 tracking-wider text-white/35 sm:block sm:text-sm">最近整理<br />2026.08 / 主題優先</div>
          </div>

          <div className="mb-10 max-w-2xl">
            <label htmlFor="catalog-search" className="mb-3 block font-mono text-xs uppercase tracking-[.25em] text-[#c89b5c] sm:text-sm">搜尋主題</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c89b5c]" />
              <input id="catalog-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋主題、店家、城市或風格..." className="w-full border border-white/15 bg-[#151917] py-3.5 pl-11 pr-12 font-sans text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#c89b5c] focus:ring-1 focus:ring-[#c89b5c]/40" />
              {query && <button type="button" aria-label="清除關鍵字" title="清除關鍵字" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-white/45 transition hover:text-[#c89b5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b5c]"><X size={15} /></button>}
            </div>
            <div className="mt-2 font-mono text-xs tracking-wider text-white/35 sm:text-sm">即時搜尋主題、店家、城市或風格 · 找到 {filtered.length} 筆</div>
          </div>

          {filtered.length === 0 ? (
            <div className="border border-dashed border-white/20 py-24 text-center">
              <Compass className="mx-auto mb-5 text-[#c89b5c]" size={30} />
              <p className="font-serif text-2xl">{showFavoritesOnly ? "你還沒有收藏符合條件的主題" : "沒有符合條件的主題"}</p>
              <button onClick={clearFilters} className="mt-5 font-mono text-xs tracking-widest text-[#c89b5c] underline underline-offset-4 sm:text-sm">清除篩選條件</button>
            </div>
          ) : (
            <>
              <div ref={catalogGridRef} id="catalog-grid" className="grid scroll-mt-32 grid-cols-1 gap-6 lg:grid-cols-2">
                {visibleTopics.map((topic, index) => (
                  <TopicCard
                    key={topic.id}
                    topic={topic}
                    index={(page - 1) * PAGE_SIZE + index}
                    isFavorite={favoriteIds.has(topic.id)}
                    onToggleFavorite={() => toggleFavorite(topic.id)}
                  />
                ))}
              </div>
              <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
                <div className="font-mono text-xs tracking-widest text-white/40 sm:text-sm">第 {page}／{pageCount} 頁 · 顯示 {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}，共 {filtered.length} 筆</div>
                <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto sm:w-auto sm:overflow-visible">
                  <button type="button" disabled={page === 1} onClick={() => goToPage(page - 1)} className="border border-white/15 px-4 py-2 font-mono text-xs tracking-wider text-white/65 transition hover:border-[#c89b5c] hover:text-[#c89b5c] disabled:cursor-not-allowed disabled:opacity-25 sm:text-sm">← 上一頁</button>
                  <div className="flex max-w-[calc(100vw-2.5rem)] items-center gap-1 overflow-x-auto">
                    <span className="hidden font-mono text-xs text-white/35 sm:inline sm:text-sm">跳到／</span>
                    {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                      <button key={pageNumber} type="button" aria-current={page === pageNumber ? "page" : undefined} onClick={() => goToPage(pageNumber)} className={`min-w-8 border px-2 py-2 font-mono text-xs transition sm:text-sm ${page === pageNumber ? "border-[#c89b5c] bg-[#c89b5c] font-bold text-[#0c0e0d]" : "border-white/15 text-white/55 hover:border-[#c89b5c]/70 hover:text-[#c89b5c]"}`}>
                        {pageNumber}
                      </button>
                    ))}
                  </div>
                  <span className="sr-only">目前第 {page} 頁</span>
                  <button type="button" disabled={page === pageCount} onClick={() => goToPage(page + 1)} className="border border-[#c89b5c]/60 bg-[#c89b5c] px-4 py-2 font-mono text-xs font-bold tracking-wider text-[#0c0e0d] transition hover:bg-[#e0bd83] disabled:cursor-not-allowed disabled:opacity-25 sm:text-sm">下一頁 →</button>
                </div>
              </div>
            </>
          )}
        </section>

        <section id="method" className="border-y border-white/10 bg-[#111412] py-20">
          <div className="mx-auto grid max-w-[1400px] gap-12 px-5 lg:grid-cols-[.8fr_1.2fr] lg:px-10">
            <div>
              <div className="mb-4 font-mono text-xs uppercase tracking-[.3em] text-[#c89b5c] sm:text-sm">01 / Method</div>
              <h2 className="font-serif text-4xl font-bold">主題先行。<br /><span className="text-white/45">店家只是座標。</span></h2>
            </div>
            <div className="grid gap-8 sm:grid-cols-3">
              <Method icon={<Users size={20} />} title="先看人數">先確認適合幾個人一起玩，再挑最對味的主題。</Method>
              <Method icon={<Flame size={20} />} title="看懂刺激度">恐怖與燒腦分開標記，跨店家資訊比對完整度高，挑起來更直覺。</Method>
              <Method icon={<Check size={20} />} title="直接預約">每張卡都連到店家官方預約入口，活動檔期與票價請見官方公告。</Method>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 px-5 py-8 lg:px-10">
        <div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-4 font-mono text-xs uppercase tracking-[.2em] text-white/35 sm:flex-row sm:text-sm">
          <span>© 2026 The Escape Index / Taiwan</span><span>給喜歡探索的團隊</span>
        </div>
      </footer>
      {showBackToTop && <button type="button" aria-label="回到頂部" title="回到頂部" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="fixed bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center border border-[#c89b5c]/70 bg-[#151917]/95 text-[#c89b5c] shadow-[0_8px_30px_rgba(0,0,0,.45)] backdrop-blur-md transition duration-200 hover:-translate-y-1 hover:bg-[#c89b5c] hover:text-[#0c0e0d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b5c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0e0d] motion-reduce:transition-none"><ArrowUp size={18} strokeWidth={1.8} /></button>}
    </div>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return <div><div className="text-4xl text-[#c89b5c]">{value}</div><div className="mt-1 text-xs uppercase tracking-widest text-white/45 sm:text-sm">{label}</div></div>;
}

function Method({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div><div className="mb-5 text-[#c89b5c]">{icon}</div><h3 className="mb-2 font-bold">{title}</h3><p className="text-sm leading-7 text-white/45">{children}</p></div>;
}

function TopicCard({ topic, index, isFavorite, onToggleFavorite }: { topic: (typeof topics)[number]; index: number; isFavorite: boolean; onToggleFavorite: () => void }) {
  const image = index % 3 === 0
    ? "/manus-storage/card-archival-room_28840e3c.png"
    : index % 3 === 1
      ? "/manus-storage/card-ritual-basement_7b06bae4.png"
      : "/manus-storage/card-clockwork-lab_7ed1438f.png";
  const hasPros = topic.pros.length > 0;
  const hasCons = topic.cons.length > 0;

  return (
    <article data-topic-id={topic.id} style={{ contentVisibility: "auto", containIntrinsicSize: "420px" }} className="group flex min-h-[470px] flex-col overflow-hidden border border-white/10 bg-[#151917] transition duration-300 hover:-translate-y-1 hover:border-[#c89b5c]/70">
      <div className="relative h-52 overflow-hidden">
        <img src={image} alt={`${topic.name} 主題氛圍`} className="h-full w-full object-cover opacity-65 transition duration-500 group-hover:scale-[1.04] group-hover:opacity-85" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#151917] via-transparent to-transparent" />
        <span className="absolute left-4 top-4 border border-[#c89b5c]/60 bg-[#0c0e0d]/85 px-2 py-1 font-mono text-xs tracking-[.2em] text-[#c89b5c] sm:text-sm">ROOM {String(index + 1).padStart(2, "0")}</span>
        <span className="absolute right-4 top-4 bg-[#0c0e0d]/80 px-2 py-1 font-mono text-xs tracking-wider text-white/60 sm:text-sm">{topic.city.replace("市", "")} / {topic.district}</span>
        <button type="button" aria-label={isFavorite ? `取消收藏 ${topic.name}` : `收藏 ${topic.name}`} aria-pressed={isFavorite} title={isFavorite ? "取消收藏" : "加入我的最愛"} onClick={onToggleFavorite} className={`absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md transition active:scale-95 ${isFavorite ? "border-rose-300 bg-rose-400 text-[#151917] shadow-[0_0_18px_rgba(251,113,133,.45)]" : "border-white/25 bg-[#0c0e0d]/75 text-white/70 hover:border-rose-300 hover:text-rose-300"}`}>
          <Heart size={19} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-6">
        <div className="font-mono text-xs tracking-wider text-[#5e8b92] sm:text-sm">{topic.venue_name} · {topic.city}</div>
        <h3 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#f3efe7] sm:text-3xl">《{topic.name}》</h3>
        <div className="mt-4 border-l-2 border-[#c89b5c]/50 bg-[#111412]/60 px-3 py-2 text-xs italic leading-6 text-slate-400 sm:text-sm">
          <span aria-hidden="true" className="mr-1 text-[#c89b5c]">✦</span>
          {topic.story_summary ?? "公開劇情資訊較少，想了解完整設定，請直接查看店家官網介紹。"}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-base text-[#c89b5c]">
          <Star size={17} fill="currentColor" />
          {topic.google_rating ? <><strong>{topic.google_rating.toFixed(1)}</strong><span className="text-xs text-white/45 sm:text-sm">工作室評分</span></> : <strong className="text-sm">依官網公告</strong>}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 border-y border-white/10 py-4">
          <Metric icon={<Users size={17} />} label="建議人數" value={playerLabel(topic.players)} />
          <Metric icon={<Clock3 size={17} />} label="遊戲時間" value={topic.duration} />
          <Metric icon={<Flame size={17} />} label="恐怖指數" value={<ScoreDots value={topic.horror} tone="horror" />} />
          <Metric icon={<Brain size={17} />} label="燒腦程度" value={<ScoreDots value={topic.brain} tone="brain" />} />
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {topic.styles.slice(0, 3).map((style) => <span key={style} className="border border-[#5e8b92]/35 bg-[#202925] px-2 py-1 font-mono text-xs text-[#b7cdc7] sm:text-sm">{style}</span>)}
        </div>
        {(hasPros || hasCons) && (
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-xs sm:grid-cols-2 sm:text-sm">
            {hasPros && <TagPanel title="👍 優點標籤" tags={topic.pros} tone="pro" fullWidth={!hasCons} />}
            {hasCons && <TagPanel title="👎 缺點標籤" tags={topic.cons} tone="con" fullWidth={!hasPros} />}
          </div>
        )}
        <a href={topic.booking_url} target="_blank" rel="noreferrer" className="mt-6 flex w-full items-center justify-between rounded-lg bg-[#c89b5c] px-5 py-4 font-mono text-xs font-bold tracking-wider text-[#0c0e0d] transition hover:bg-[#e0bd83] active:scale-[.98] sm:text-sm">
          立即預約此主題（享獨家優惠）<ExternalLink size={15} />
        </a>
      </div>
    </article>
  );
}

function TagPanel({ title, tags, tone, fullWidth }: { title: string; tags: string[]; tone: "pro" | "con"; fullWidth: boolean }) {
  const isPro = tone === "pro";
  return (
    <div className={`min-w-0 border p-3 ${fullWidth ? "sm:col-span-2" : ""} ${isPro ? "border-[#6e9c82]/25 bg-[#173025]/45" : "border-[#a66b63]/25 bg-[#351e20]/45"}`}>
      <div className={`mb-2 font-mono text-xs tracking-widest sm:text-sm ${isPro ? "text-[#9bd3a7]" : "text-[#e5a198]"}`}>{title}</div>
      <div data-tag-scroll={tone} className="flex min-w-0 gap-2 overflow-x-auto pb-2 [scrollbar-color:#c89b5c_#202522] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#c89b5c]/70 [&::-webkit-scrollbar-track]:bg-black/25 [&::-webkit-scrollbar]:h-1.5">
        {tags.map((tag) => (
          <span key={tag} className={`shrink-0 whitespace-nowrap border px-2 py-1 ${isPro ? "border-[#6e9c82]/30 text-[#c6d7ca]" : "border-[#a66b63]/30 text-[#e0c5c0]"}`}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

function ScoreDots({ value, tone }: { value: number | null; tone: "horror" | "brain" }) {
  if (!value) return <span className="text-white/35">依官網公告</span>;
  const activeClass = tone === "horror" ? "bg-red-500 shadow-[0_0_8px_#ef4444]" : "bg-indigo-400 shadow-[0_0_8px_#818cf8]";
  return (
    <span className="inline-flex items-center gap-2" aria-label={`${value} / 5`}>
      {Array.from({ length: 5 }, (_, index) => <span key={index} aria-hidden="true" className={`h-3 w-3 rounded-full transition sm:h-3.5 sm:w-3.5 ${index < value ? activeClass : "bg-slate-700"}`} />)}
      <span className="ml-1 text-xs text-white/45">{value}/5</span>
    </span>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="min-w-0"><div className="flex items-center gap-1.5 font-mono text-xs tracking-wider text-white/50 sm:text-sm">{icon}{label}</div><div className="mt-2 font-mono text-xs text-[#d5e0dc] sm:text-sm">{value}</div></div>;
}
