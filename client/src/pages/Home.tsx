/**
 * Style: 夜蝕都市 Neo-noir editorial；煤黑、氧化金、冷霧藍。
 * Content model: 一張卡片 = 一個可被比較、收藏與預約的密室主題。
 */
import { FAVORITES_STORAGE_KEY, parseFavoriteIds, serializeFavoriteIds, toggleFavoriteId } from "@/lib/favorites";
import { trpc } from "@/lib/trpc";
import { HERO_COPY } from "@/lib/heroCopy";
import { ADVENTURER_GUILD_BOOKING_URL, ADVENTURER_GUILD_CTA_LABEL, bookingCtaLayoutClassName, shouldShowAdventurerGuildCta } from "@/lib/bookingCta";
import { pageForItem, pickRandom } from "@/lib/randomPick";
import { isTopicJumpReady, needsTopicPageChange, prepareTopicJump, type TopicJumpTarget } from "@/lib/topicJump";
import SiteFooter from "@/components/SiteFooter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowDownUp,
  ArrowUp,
  CalendarDays,
  MessageCircle,
  Pencil,
  Save,
  Send,
  Trash2,
  Brain,
  Check,
  Clock3,
  Compass,
  Dices,
  ExternalLink,
  Flame,
  Heart,
  Search,
  Star,
  Users,
  Wrench,
  KeyRound,
  Hourglass,
  LockKeyhole,
  DoorOpen,
  Sparkles,
  Gem,
  Ghost,
  Bomb,
  ScrollText,
  Map,
  Eye,
  Skull,
  ShieldAlert,
  Crown,
  CircleHelp,
  Telescope,
  ThumbsUp,
  X,
} from "lucide-react";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import topics from "../../../data/topics.json";

type Filter = "all" | "2-4" | "5-plus" | "beginner" | "brainy" | "horror" | "puzzle";
type SortMode = "rating" | "horror" | "brain";
type TopicJumpRequest = ReturnType<typeof prepareTopicJump>;

const PAGE_SIZE = 10;
const cityFilters = ["全台", "台北市", "新北市", "桃園市", "台中市", "台南市", "宜蘭市", "高雄市"] as const;
const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "全部主題" },
  { id: "2-4", label: "2–4 人" },
  { id: "5-plus", label: "5 人以上" },
  { id: "beginner", label: "新手入門" },
  { id: "brainy", label: "重度燒腦" },
  { id: "horror", label: "恐怖驚悚" },
  { id: "puzzle", label: "機關解謎" },
];

const AVATAR_OPTIONS = [
  { id: "detective", label: "偵探", icon: Search },
  { id: "mechanism", label: "機關師", icon: Wrench },
  { id: "keymaster", label: "解密者", icon: KeyRound },
  { id: "lamplighter", label: "提燈人", icon: Flame },
  { id: "timekeeper", label: "時間守門人", icon: Hourglass },
  { id: "lockbreaker", label: "破鎖者", icon: LockKeyhole },
  { id: "gatekeeper", label: "密門守衛", icon: DoorOpen },
  { id: "navigator", label: "線索嚮導", icon: Compass },
  { id: "arcane-scholar", label: "秘法學者", icon: Sparkles },
  { id: "treasure-hunter", label: "古墓獵人", icon: Gem },
  { id: "shadow-stalker", label: "暗影潛行者", icon: Ghost },
  { id: "trap-disarmer", label: "陷阱拆解師", icon: Bomb },
  { id: "archive-keeper", label: "檔案守藏人", icon: ScrollText },
  { id: "map-reader", label: "古圖解讀者", icon: Map },
  { id: "watcher", label: "密室觀察者", icon: Eye },
  { id: "crypt-warden", label: "墓穴守望者", icon: Skull },
  { id: "hazard-scout", label: "危機斥候", icon: ShieldAlert },
  { id: "riddle-master", label: "謎語大師", icon: Crown },
  { id: "clue-seeker", label: "線索追尋者", icon: CircleHelp },
  { id: "stargazer", label: "星象探勘者", icon: Telescope },
] as const;
type AvatarId = (typeof AVATAR_OPTIONS)[number]["id"];

const ANONYMOUS_TOKEN_KEY = "escape-index-anonymous-token";
const ANONYMOUS_NAME_KEY = "escape-index-anonymous-name";
const ANONYMOUS_AVATAR_KEY = "escape-index-anonymous-avatar";
const HELPFUL_COMMENTS_KEY = "escape-index-helpful-comments";
const COMMENT_LAST_SUBMITTED_KEY = "escape-index-comment-last-submitted";
const COMMENT_RATE_LIMIT_MS = 30_000;
const QUICK_COMMENT_EMOJIS = ["🧩", "👻", "👍", "🔐", "⏳", "🔥"] as const;
const COMMENT_EMOJI_OPTIONS = [
  "😂", "❤️", "🤣", "🥰", "😗", "😢", "😌", "😊", "👍",
  "😁", "🙏", "😍", "😔", "😄", "😭", "💋", "😒", "😳",
  "😜", "🙈", "😉", "😃", "😝", "😱", "😡", "😏", "😞",
  "😅", "😚", "🙊", "😴", "🙃", "😋", "😆", "👌", "😐", "🙁",
] as const;

function readHelpfulCommentIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HELPFUL_COMMENTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id) && id > 0) : [];
  } catch {
    return [];
  }
}

function saveHelpfulCommentIds(ids: number[]) {
  window.localStorage.setItem(HELPFUL_COMMENTS_KEY, JSON.stringify(Array.from(new Set(ids))));
}

function readLastCommentSubmittedAt() {
  if (typeof window === "undefined") return 0;
  const timestamp = Number(window.localStorage.getItem(COMMENT_LAST_SUBMITTED_KEY) || 0);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function randomAvatarId() {
  return AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)].id;
}

function avatarForSeed(avatarId: string | null | undefined, seed: string) {
  const direct = AVATAR_OPTIONS.find((option) => option.id === avatarId);
  if (direct) return direct;
  const hash = seed.split("").reduce((total, character) => total + character.charCodeAt(0), 0);
  return AVATAR_OPTIONS[hash % AVATAR_OPTIONS.length];
}

function getAnonymousIdentity() {
  if (typeof window === "undefined") return { token: "", name: "", avatarId: "" };
  let token = window.localStorage.getItem(ANONYMOUS_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    window.localStorage.setItem(ANONYMOUS_TOKEN_KEY, token);
  }
  let avatarId = window.localStorage.getItem(ANONYMOUS_AVATAR_KEY);
  if (!avatarId || !AVATAR_OPTIONS.some((option) => option.id === avatarId)) {
    avatarId = randomAvatarId();
    window.localStorage.setItem(ANONYMOUS_AVATAR_KEY, avatarId);
  }
  return { token, name: window.localStorage.getItem(ANONYMOUS_NAME_KEY)?.trim() || "", avatarId };
}

function makeSuggestedName(base = "探險家", token = "") {
  const suffix = (token || crypto.randomUUID()).replace(/-/g, "").slice(0, 4);
  return `${base}_${suffix}`;
}

function playerBounds(value: string) {
  const values = value.match(/\d+/g)?.map(Number) ?? [];
  return { min: values[0] ?? null, max: values.at(-1) ?? null };
}

function playerLabel(value: string) {
  return /\d/.test(value) ? `${value}人` : "依官網公告";
}

function locationLabel(city: string, district: string) {
  return district.includes("／") ? `${city.replace("市", "")}／據點依官網公告` : `${city.replace("市", "")}／${district}`;
}

function releaseTimeLabel(value: string | null | undefined) {
  return value?.trim() || "尚未收錄";
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
  const [isRandomDialogOpen, setIsRandomDialogOpen] = useState(false);
  const [isDrawingRandom, setIsDrawingRandom] = useState(false);
  const [isJumpingToTopic, setIsJumpingToTopic] = useState(false);
  const [randomTopic, setRandomTopic] = useState<(typeof topics)[number] | null>(null);
  const [focusedTopicId, setFocusedTopicId] = useState<string | null>(null);
  const [mountedJumpTopicId, setMountedJumpTopicId] = useState<string | null>(null);
  const [topicJumpRequest, setTopicJumpRequest] = useState<TopicJumpRequest | null>(null);
  const [pendingTopicJump, setPendingTopicJump] = useState<TopicJumpTarget | null>(null);
  const catalogGridRef = useRef<HTMLDivElement>(null);
  const filterBarRef = useRef<HTMLElement>(null);
  const targetCardRef = useRef<HTMLElement | null>(null);
  const shouldScrollToGrid = useRef(false);
  const randomDrawTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  useLayoutEffect(() => {
    if (!topicJumpRequest || topicJumpRequest.targetPage !== page) return;

    const target = targetCardRef.current;
    if (!isTopicJumpReady({
      dialogOpen: isRandomDialogOpen,
      currentPage: page,
      request: topicJumpRequest,
      targetAttached: Boolean(target),
    })) {
      if (topicJumpRequest.attempts < 45) {
        const retryFrame = window.requestAnimationFrame(() => {
          setTopicJumpRequest((current) => current ? { ...current, attempts: current.attempts + 1 } : null);
        });
        return () => window.cancelAnimationFrame(retryFrame);
      }
      setIsJumpingToTopic(false);
      setTopicJumpRequest(null);
      return;
    }
    if (!target) {
      return;
    }

    let previousHeight = 0;
    let stableFrames = 0;
    let waitFrames = 0;
    let frameId = 0;
    const desiredTop = () => (filterBarRef.current?.offsetHeight ?? 0) + 20;
    const finish = () => {
      setFocusedTopicId(topicJumpRequest.topicId);
      setTopicJumpRequest(null);
      setIsJumpingToTopic(false);
    };
    let alignedFrames = 0;
    const confirmPosition = (attempt: number) => {
      const offset = target.getBoundingClientRect().top - desiredTop();
      if (Math.abs(offset) <= 1) {
        alignedFrames += 1;
      } else {
        alignedFrames = 0;
        window.scrollTo({ top: window.scrollY + offset, behavior: "auto" });
      }
      if (alignedFrames >= 3 || attempt >= 90) {
        finish();
        return;
      }
      frameId = window.requestAnimationFrame(() => confirmPosition(attempt + 1));
    };
    const waitForStableLayout = () => {
      const currentHeight = document.documentElement.scrollHeight;
      stableFrames = currentHeight === previousHeight ? stableFrames + 1 : 0;
      previousHeight = currentHeight;
      waitFrames += 1;

      if (stableFrames < 2 && waitFrames < 12) {
        frameId = window.requestAnimationFrame(waitForStableLayout);
        return;
      }

      const destination = window.scrollY + target.getBoundingClientRect().top - desiredTop();
      window.scrollTo({ top: destination, behavior: "auto" });
      frameId = window.requestAnimationFrame(() => confirmPosition(0));
    };
    frameId = window.requestAnimationFrame(waitForStableLayout);

    return () => window.cancelAnimationFrame(frameId);
  }, [isRandomDialogOpen, page, topicJumpRequest]);
  useEffect(() => {
    if (!isJumpingToTopic) return;
    const htmlOverflowAnchor = document.documentElement.style.overflowAnchor;
    const bodyOverflowAnchor = document.body.style.overflowAnchor;
    document.documentElement.style.overflowAnchor = "none";
    document.body.style.overflowAnchor = "none";
    return () => {
      document.documentElement.style.overflowAnchor = htmlOverflowAnchor;
      document.body.style.overflowAnchor = bodyOverflowAnchor;
    };
  }, [isJumpingToTopic]);
  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 520);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  useEffect(() => () => {
    if (randomDrawTimer.current) clearTimeout(randomDrawTimer.current);
  }, []);
  useEffect(() => {
    if (!focusedTopicId) return;
    const timer = window.setTimeout(() => setFocusedTopicId(null), 1900);
    return () => window.clearTimeout(timer);
  }, [focusedTopicId]);
  useEffect(() => {
    if (isRandomDialogOpen || !pendingTopicJump) return;
    let frameId = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(() => {
        setTopicJumpRequest(prepareTopicJump(pendingTopicJump));
        setPendingTopicJump(null);
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isRandomDialogOpen, pendingTopicJump]);

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
  const drawRandomTopic = () => {
    if (isDrawingRandom || isJumpingToTopic) return;
    const chosenTopic = pickRandom(filtered);
    if (randomDrawTimer.current) clearTimeout(randomDrawTimer.current);

    setIsRandomDialogOpen(true);
    setRandomTopic(null);
    setIsDrawingRandom(Boolean(chosenTopic));

    if (!chosenTopic) return;
    randomDrawTimer.current = setTimeout(() => {
      setRandomTopic(chosenTopic);
      setIsDrawingRandom(false);
    }, 620);
  };
  const viewRandomTopic = () => {
    if (!randomTopic) return;

    const targetPage = pageForItem(filtered, randomTopic, PAGE_SIZE);
    if (!targetPage) return;

    setFocusedTopicId(null);
    setMountedJumpTopicId(null);
    targetCardRef.current = null;
    setIsJumpingToTopic(true);
    setPendingTopicJump({ topicId: randomTopic.id, targetPage });
    setIsRandomDialogOpen(false);
    if (needsTopicPageChange(page, targetPage)) setPage(targetPage);
  };
  const handleRandomDialogCloseAutoFocus = (event: Event) => {
    event.preventDefault();
  };

  return (
    <div className="min-h-screen bg-[#0c0e0d] text-[#e8e4db] selection:bg-[#c89b5c] selection:text-[#0c0e0d]">
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.06] [background-image:linear-gradient(rgba(200,155,92,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(200,155,92,.35)_1px,transparent_1px)] [background-size:54px_54px]" />
      <header className="relative z-10 border-b border-white/10 bg-[#0c0e0d]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 lg:px-10">
          <a href="#top" className="flex items-center gap-3">
            <img src="/media/brand-sigil_8091f515.png" className="h-10 w-10 object-contain" alt="全台密室逃脫精選導覽圖騰" />
            <span className="font-mono text-xs uppercase tracking-[.3em] text-[#c89b5c] sm:text-sm">
              The Escape Index<br />
              <b className="font-sans text-sm tracking-[.16em] text-[#e8e4db]">全台密室逃脫精選導覽</b>
            </span>
          </a>
          <nav className="hidden items-center gap-8 font-mono text-xs uppercase tracking-[.2em] text-white/50 sm:text-sm md:flex">
            <a href="#catalog" className="hover:text-[#c89b5c]">主題篩選</a>
            <a href="#method" className="hover:text-[#c89b5c]">挑選指南</a>
          </nav>
          <div className="flex items-center gap-4">
            <HomeAuthControls />
            <div className="hidden font-mono text-xs tracking-widest text-white/40 sm:block sm:text-sm">{HERO_COPY.archiveLabel}</div>
          </div>
        </div>
      </header>

      <main id="top" className="relative z-10">
        <section className="relative overflow-hidden border-b border-white/10">
          <img src="/media/hero-night-alley-clean_45b950d0.png" alt="夜晚台灣城市巷弄中的神秘入口" className="absolute inset-0 h-full w-full object-cover opacity-55" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0c0e0d] via-[#0c0e0d]/80 to-transparent" />
          <div className="mx-auto flex min-h-[600px] max-w-[1400px] items-end px-5 pb-16 pt-20 lg:px-10 lg:pb-24">
            <div className="relative max-w-3xl">
              <div className="mb-7 flex items-center gap-3 font-mono text-xs uppercase tracking-[.3em] text-[#c89b5c] sm:text-sm">
                <span className="h-px w-10 bg-[#c89b5c]" /> {HERO_COPY.radarLabel}
              </div>
              <h1 className="font-serif text-5xl font-black leading-[.98] tracking-tight text-[#f3efe7] sm:text-7xl lg:text-[92px]">
                {HERO_COPY.headlineFirst}<br /><em className="font-normal text-[#c89b5c]">{HERO_COPY.headlineSecond}</em>
              </h1>
              <p className="mt-8 max-w-xl text-base leading-8 text-white/70 sm:text-lg">
                {HERO_COPY.subtitle}
              </p>
              <button
                id="random-draw"
                type="button"
                onClick={drawRandomTopic}
                disabled={filtered.length === 0 || isDrawingRandom || isJumpingToTopic}
                className="group mt-8 inline-flex items-center gap-3 border border-[#c89b5c]/80 bg-[#151917]/85 px-5 py-3 font-mono text-xs tracking-[.16em] text-[#f3efe7] shadow-[0_10px_28px_rgba(0,0,0,.35)] backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#c89b5c] hover:text-[#0c0e0d] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none sm:text-sm"
              >
                <Dices size={20} className="text-[#c89b5c] transition group-hover:rotate-12 group-hover:text-[#0c0e0d]" />
                <span className="text-left"><b className="block font-sans text-sm tracking-normal">{isJumpingToTopic ? "正在帶你前往主題…" : "今天玩什麼？"}</b><span className="text-white/50 group-hover:text-[#0c0e0d]/70">{isJumpingToTopic ? "請稍候" : "依目前篩選隨機盲抽"}</span></span>
              </button>
            </div>
          </div>
        </section>

        <section ref={filterBarRef} className="sticky top-0 z-20 border-b border-white/10 bg-[#111412]/95 backdrop-blur-xl">
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
              <div className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-[.3em] text-[#5e8b92] sm:text-sm"><span className="h-px w-8 bg-[#5e8b92]" /> 主題資料庫</div>
              <h2 className="font-serif text-4xl font-bold text-[#f3efe7] sm:text-5xl">一場一場比較。<br /><span className="text-white/45">找到今晚想玩的主題。</span></h2>
            </div>
            <div className="hidden text-right font-mono text-xs leading-6 tracking-wider text-white/35 sm:block sm:text-sm">資料整理<br />2026 年 8 月</div>
          </div>

          <div className="mb-10 max-w-2xl">
            <label htmlFor="catalog-search" className="mb-3 block font-mono text-xs uppercase tracking-[.25em] text-[#c89b5c] sm:text-sm">搜尋主題</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c89b5c]" />
              <input id="catalog-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋主題、店家、城市或風格..." className="w-full border border-white/15 bg-[#151917] py-3.5 pl-11 pr-12 font-sans text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#c89b5c] focus:ring-1 focus:ring-[#c89b5c]/40" />
              {query && <button type="button" aria-label="清除關鍵字" title="清除關鍵字" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-white/45 transition hover:text-[#c89b5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b5c]"><X size={15} /></button>}
            </div>
            <div className="mt-2 font-mono text-xs tracking-wider text-white/35 sm:text-sm">可搜尋主題、店家、城市或風格 · 找到 {filtered.length} 個主題</div>
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
                    isFocused={focusedTopicId === topic.id}
                    isJumpRefMounted={topic.id === mountedJumpTopicId}
                    onCardRef={topic.id === topicJumpRequest?.topicId ? (element) => {
                      if (!element) return;
                      targetCardRef.current = element;
                      setMountedJumpTopicId(topic.id);
                    } : undefined}
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
              <div className="mb-4 font-mono text-xs uppercase tracking-[.3em] text-[#c89b5c] sm:text-sm">CHOOSING GUIDE</div>
              <h2 className="font-serif text-4xl font-bold">先選主題。<br /><span className="text-white/45">再找適合的店家。</span></h2>
            </div>
            <div className="grid gap-8 sm:grid-cols-3">
              <Method icon={<Users size={20} />} title="先看人數">先確認適合幾個人一起玩，再挑最對味的主題。</Method>
              <Method icon={<Flame size={20} />} title="比較刺激度">恐怖度與燒腦度分開標示，跨店家比較更直覺。</Method>
              <Method icon={<Check size={20} />} title="前往官方預約">每張卡都連到店家官方預約頁，活動檔期與票價依官網公告。</Method>
            </div>
          </div>
        </section>
      </main>

      <Dialog open={isRandomDialogOpen} onOpenChange={setIsRandomDialogOpen}>
        <DialogContent
          showCloseButton={!isDrawingRandom}
          className="border-[#c89b5c]/55 bg-[#101311] p-0 text-[#f3efe7] shadow-[0_28px_90px_rgba(0,0,0,.7)]"
          onCloseAutoFocus={handleRandomDialogCloseAutoFocus}
        >
          <div className="border-b border-[#c89b5c]/25 bg-[radial-gradient(circle_at_top_right,rgba(200,155,92,.18),transparent_50%)] p-7 sm:p-8">
            <DialogHeader className="text-left">
              <div className="mb-4 flex h-12 w-12 items-center justify-center border border-[#c89b5c]/60 bg-[#0c0e0d] text-[#c89b5c]">
                <Dices size={24} className={isDrawingRandom ? "animate-spin" : ""} />
              </div>
              <DialogTitle className="font-serif text-3xl text-[#f3efe7]">{isDrawingRandom ? "正在為你挑選今晚的主題…" : "今晚，就玩這一場。"}</DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-white/55">
                {isDrawingRandom ? `從目前 ${filtered.length} 個符合條件的主題中盲抽中。` : "結果只根據你現在的地區、主題與收藏篩選，不加入任何置入推薦。"}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-7 sm:p-8">
            {isDrawingRandom ? (
              <div className="flex min-h-48 flex-col items-center justify-center text-center">
                <div className="mb-6 h-14 w-14 animate-spin rounded-full border-2 border-[#c89b5c]/20 border-t-[#c89b5c]" />
                <p className="font-mono text-xs tracking-[.2em] text-[#c89b5c]">正在盲抽符合條件的主題</p>
              </div>
            ) : randomTopic ? (
              <div id="random-draw-result" className="border border-white/10 bg-[#151917] p-5">
                <div className="mb-4 flex items-center justify-between gap-4 font-mono text-xs tracking-wider text-[#5e8b92]">
                  <span>{randomTopic.venue_name}</span><span>{locationLabel(randomTopic.city, randomTopic.district)}</span>
                </div>
                <h3 className="font-serif text-4xl font-bold text-[#f3efe7]">《{randomTopic.name}》</h3>
                <p className="mt-4 border-l-2 border-[#c89b5c]/50 pl-3 text-sm leading-7 text-white/60">{randomTopic.story_summary}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {randomTopic.styles.slice(0, 3).map((style) => <span key={style} className="border border-[#5e8b92]/35 bg-[#202925] px-2 py-1 font-mono text-xs text-[#b7cdc7]">{style}</span>)}
                </div>
              </div>
            ) : (
              <div id="random-draw-empty" className="min-h-44 border border-dashed border-white/20 p-7 text-center text-sm leading-7 text-white/60">目前篩選條件沒有符合的主題。先調整地區、主題或我的最愛篩選，再試一次。</div>
            )}
          </div>

          {!isDrawingRandom && (
            <DialogFooter className="border-t border-white/10 px-7 py-5 sm:px-8">
              <button type="button" onClick={drawRandomTopic} className="border border-[#c89b5c]/70 px-4 py-2.5 font-mono text-xs tracking-wider text-[#c89b5c] transition hover:bg-[#c89b5c] hover:text-[#0c0e0d]">再抽一次</button>
              {randomTopic && <button type="button" onClick={viewRandomTopic} className="inline-flex items-center justify-center bg-[#c89b5c] px-4 py-2.5 font-mono text-xs font-bold tracking-wider text-[#0c0e0d] transition hover:bg-[#e0bd83]">查看主題</button>}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <SiteFooter />
      {showBackToTop && <button type="button" aria-label="回到頂部" title="回到頂部" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="fixed bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center border border-[#c89b5c]/70 bg-[#151917]/95 text-[#c89b5c] shadow-[0_8px_30px_rgba(0,0,0,.45)] backdrop-blur-md transition duration-200 hover:-translate-y-1 hover:bg-[#c89b5c] hover:text-[#0c0e0d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b5c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0e0d] motion-reduce:transition-none"><ArrowUp size={18} strokeWidth={1.8} /></button>}
    </div>
  );
}

function Method({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div><div className="mb-5 text-[#c89b5c]">{icon}</div><h3 className="mb-2 font-bold">{title}</h3><p className="text-sm leading-7 text-white/45">{children}</p></div>;
}

function TopicCard({ topic, index, isFavorite, onToggleFavorite, isFocused = false, isJumpRefMounted = false, onCardRef }: { topic: (typeof topics)[number]; index: number; isFavorite: boolean; onToggleFavorite: () => void; isFocused?: boolean; isJumpRefMounted?: boolean; onCardRef?: (element: HTMLElement | null) => void }) {
  const reviewStatsQuery = trpc.comments.stats.useQuery({ topicId: topic.id });
  const reviewStats = reviewStatsQuery.data;
  const image = index % 3 === 0
    ? "/media/card-archival-room_28840e3c.png"
    : index % 3 === 1
      ? "/media/card-ritual-basement_7b06bae4.png"
      : "/media/card-clockwork-lab_7ed1438f.png";
  const hasPros = topic.pros.length > 0;
  const hasCons = topic.cons.length > 0;
  const showAdventurerGuildCta = shouldShowAdventurerGuildCta(topic.venue_name, topic.name);

  return (
    <article ref={onCardRef} id={`topic-${topic.id}`} data-topic-id={topic.id} data-jump-ref={isJumpRefMounted ? "mounted" : undefined} className={`group flex min-h-[470px] flex-col overflow-hidden border bg-[#151917] transition duration-300 hover:-translate-y-1 hover:border-[#c89b5c]/70 ${isFocused ? "border-[#c89b5c] ring-2 ring-[#c89b5c]/70 ring-offset-4 ring-offset-[#0c0e0d]" : "border-white/10"}`}>
      <div className="relative h-52 overflow-hidden">
        <img src={image} alt={`${topic.name} 主題氛圍`} className="h-full w-full object-cover opacity-65 transition duration-500 group-hover:scale-[1.04] group-hover:opacity-85" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#151917] via-transparent to-transparent" />
        <span className="absolute left-4 top-4 border border-[#c89b5c]/60 bg-[#0c0e0d]/85 px-2 py-1 font-mono text-xs tracking-[.2em] text-[#c89b5c] sm:text-sm">ROOM {String(index + 1).padStart(2, "0")}</span>
        <span className="absolute right-4 top-4 bg-[#0c0e0d]/80 px-2 py-1 font-mono text-xs tracking-wider text-white/60 sm:text-sm">{locationLabel(topic.city, topic.district)}</span>
        <button type="button" aria-label={isFavorite ? `取消收藏 ${topic.name}` : `收藏 ${topic.name}`} aria-pressed={isFavorite} title={isFavorite ? "取消收藏" : "加入我的最愛"} onClick={onToggleFavorite} className={`absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md transition active:scale-95 ${isFavorite ? "border-rose-300 bg-rose-400 text-[#151917] shadow-[0_0_18px_rgba(251,113,133,.45)]" : "border-white/25 bg-[#0c0e0d]/75 text-white/70 hover:border-rose-300 hover:text-rose-300"}`}>
          <Heart size={19} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-6">
        <div className="font-mono text-xs tracking-wider text-[#5e8b92] sm:text-sm">{topic.venue_name} · {topic.city}</div>
        <h3 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#f3efe7] sm:text-3xl">《{topic.name}》</h3>
        <div className="mt-3 flex items-center gap-2 border border-[#c89b5c]/25 bg-[#111412]/70 px-3 py-2 font-mono text-xs tracking-wider text-[#c89b5c] sm:text-sm">
          <CalendarDays size={15} aria-hidden="true" />
          <span>推出時間</span>
          <span className="text-white/65">{releaseTimeLabel(topic.release_time)}</span>
        </div>
        <div className="mt-4 border-l-2 border-[#c89b5c]/50 bg-[#111412]/60 px-3 py-2 text-xs italic leading-6 text-slate-400 sm:text-sm">
          <span aria-hidden="true" className="mr-1 text-[#c89b5c]">✦</span>
          {topic.story_summary ?? "公開劇情資訊較少，想了解完整設定，請直接查看店家官網介紹。"}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-base text-[#c89b5c]">
          <Star size={17} fill="currentColor" />
          {reviewStats?.recommendationAverage ? <><strong>{reviewStats.recommendationAverage.toFixed(1)}</strong><span className="text-xs text-white/45 sm:text-sm">玩家推薦 ({reviewStats.reviewCount})</span></> : topic.google_rating ? <><strong>{topic.google_rating.toFixed(1)}</strong><span className="text-xs text-white/45 sm:text-sm">工作室評分</span></> : <strong className="text-sm">尚無評分</strong>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border border-[#c89b5c]/20 bg-[#111412]/55 px-3 py-2 font-mono text-[10px] text-white/55 sm:text-xs">
          <span className="text-[#e0bd83]">平均推薦度 {reviewStats?.recommendationAverage ? `⭐ ${reviewStats.recommendationAverage.toFixed(1)}` : "尚無評分"}</span>
          <span>平均難度 {reviewStats?.difficultyAverage ? `🧩 ${reviewStats.difficultyAverage.toFixed(1)}` : "尚無評分"}</span>
          <span className="text-white/35">({reviewStats?.reviewCount ?? 0} 則評論)</span>
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
            {hasPros && <TagPanel title="導覽重點" tags={topic.pros} tone="pro" fullWidth={!hasCons} />}
            {hasCons && <TagPanel title="遊玩提醒" tags={topic.cons} tone="con" fullWidth={!hasPros} />}
          </div>
        )}
        <div className={`mt-6 ${bookingCtaLayoutClassName(showAdventurerGuildCta)}`}>
          <a href={topic.booking_url} target="_blank" rel="noreferrer" className="flex w-full items-center justify-between rounded-lg bg-[#c89b5c] px-5 py-4 font-mono text-xs font-bold tracking-wider text-[#0c0e0d] transition hover:bg-[#e0bd83] active:scale-[.98] sm:text-sm">
            前往官方預約頁<ExternalLink size={15} />
          </a>
          {showAdventurerGuildCta && (
            <a href={ADVENTURER_GUILD_BOOKING_URL} target="_blank" rel="noreferrer" className="flex w-full items-center justify-between rounded-lg border border-[#5e8b92]/75 bg-[#202925] px-5 py-4 font-mono text-xs font-bold tracking-wider text-[#d5e0dc] transition hover:border-[#c89b5c] hover:bg-[#2a3730] active:scale-[.98] sm:text-sm">
              {ADVENTURER_GUILD_CTA_LABEL}<ExternalLink size={15} />
            </a>
          )}
        </div>
        <TopicComments topicId={topic.id} topicName={topic.name} />
      </div>
    </article>
  );
}

const NICKNAME_PRESETS = ["密幕探險家", "解謎新手", "逃脫大師", "機關破解者", "探險家"];

function NicknameDialog({
  open,
  initialName,
  initialAvatarId,
  onOpenChange,
  onConfirm,
  submitLabel = "確認",
}: {
  open: boolean;
  initialName: string;
  initialAvatarId: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string, avatarId: string) => void;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialName || makeSuggestedName());
  const [avatarId, setAvatarId] = useState<AvatarId>(avatarForSeed(initialAvatarId, initialName || "modal").id);

  useEffect(() => {
    if (open) {
      setName(initialName || makeSuggestedName());
      setAvatarId(avatarForSeed(initialAvatarId, initialName || "modal").id);
    }
  }, [initialAvatarId, initialName, open]);

  const confirm = () => {
    const trimmedName = name.trim();
    if (trimmedName) onConfirm(trimmedName, avatarId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[#5e8b92]/50 bg-[#111412] text-[#e8e4db] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono tracking-wider text-[#c89b5c]">請設定您的暱稱</DialogTitle>
          <DialogDescription className="text-xs leading-6 text-white/55">暱稱會儲存在這個瀏覽器，之後可隨時修改。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3 font-mono text-[10px] tracking-widest text-[#b7cdc7]"><span>選擇您的角色頭像</span><span className="text-white/35">20 款角色</span></div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {AVATAR_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = avatarId === option.id;
                return (
                  <button key={option.id} type="button" onClick={() => setAvatarId(option.id)} aria-label={`選擇${option.label}頭像`} title={option.label} aria-pressed={selected} className={`flex items-center justify-center border px-2 py-2.5 transition ${selected ? "border-[#c89b5c] bg-[#c89b5c]/15 text-[#e0bd83]" : "border-white/10 text-white/55 hover:border-[#5e8b92] hover:text-[#b7cdc7]"}`}>
                    <span className={`flex size-9 items-center justify-center rounded-full ${selected ? "bg-[#c89b5c] text-[#0c0e0d]" : "bg-[#202925] text-[#b7cdc7]"}`}><Icon size={18} aria-hidden="true" /></span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {NICKNAME_PRESETS.map((preset) => (
              <button key={preset} type="button" onClick={() => setName(makeSuggestedName(preset))} className="border border-[#5e8b92]/60 px-3 py-1.5 font-mono text-xs text-[#b7cdc7] transition hover:border-[#c89b5c] hover:text-[#e0bd83]">{preset}</button>
            ))}
          </div>
          <input autoFocus aria-label="暱稱" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") confirm(); }} maxLength={120} placeholder="例如：探險家_8f2a" className="w-full border border-white/15 bg-[#0c0e0d] px-3 py-2.5 text-sm text-[#e8e4db] outline-none transition placeholder:text-white/30 focus:border-[#c89b5c] focus:ring-1 focus:ring-[#c89b5c]" />
        </div>
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className="border border-white/20 px-4 py-2 font-mono text-xs text-white/60 transition hover:border-white/40">取消</button>
          <button type="button" onClick={confirm} disabled={!name.trim()} className="border border-[#c89b5c]/70 bg-[#c89b5c] px-4 py-2 font-mono text-xs font-bold text-[#0c0e0d] transition hover:bg-[#e0bd83] disabled:cursor-not-allowed disabled:opacity-45">{submitLabel}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HomeAuthControls() {
  const [identity, setIdentity] = useState(() => getAnonymousIdentity());
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const saveName = (name: string, avatarId: string) => {
    window.localStorage.setItem(ANONYMOUS_NAME_KEY, name);
    window.localStorage.setItem(ANONYMOUS_AVATAR_KEY, avatarId);
    setIdentity((current) => ({ ...current, name, avatarId }));
    window.dispatchEvent(new CustomEvent("escape-index-nickname-change"));
    setNicknameOpen(false);
  };
  const avatar = avatarForSeed(identity.avatarId, identity.token);
  const AvatarIcon = avatar.icon;

  return (
    <div className="flex items-center">
      <button type="button" onClick={() => setNicknameOpen(true)} className="flex items-center gap-2 border border-[#5e8b92]/60 px-3 py-1.5 font-mono text-[10px] tracking-wider text-[#b7cdc7] transition hover:border-[#c89b5c] hover:bg-[#c89b5c]/10 hover:text-[#e0bd83]">
        <span className="flex size-6 items-center justify-center rounded-full bg-[#c89b5c] text-[#0c0e0d]"><AvatarIcon size={14} aria-hidden="true" /></span>
        <span>{identity.name || "尚未設定"}</span>
      </button>
      <NicknameDialog open={nicknameOpen} initialName={identity.name} initialAvatarId={identity.avatarId} onOpenChange={setNicknameOpen} onConfirm={saveName} />
    </div>
  );
}

export function TopicComments({ topicId, topicName }: { topicId: string; topicName: string }) {
  const utils = trpc.useUtils();
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState("");
  const [hasSpoiler, setHasSpoiler] = useState(false);
  const [recommendationRating, setRecommendationRating] = useState(0);
  const [difficultyRating, setDifficultyRating] = useState(0);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [identity, setIdentity] = useState(() => getAnonymousIdentity());
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [pendingBody, setPendingBody] = useState("");
  const [pendingHasSpoiler, setPendingHasSpoiler] = useState(false);
  const [pendingRecommendationRating, setPendingRecommendationRating] = useState(0);
  const [pendingDifficultyRating, setPendingDifficultyRating] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [helpfulCommentIds, setHelpfulCommentIds] = useState<number[]>(readHelpfulCommentIds);
  const [revealedSpoilerIds, setRevealedSpoilerIds] = useState<number[]>([]);
  const [lastCommentSubmittedAt, setLastCommentSubmittedAt] = useState(readLastCommentSubmittedAt);
  const [rateLimitClock, setRateLimitClock] = useState(() => Date.now());
  const commentsQuery = trpc.comments.list.useQuery({ topicId });
  const commentStatsQuery = trpc.comments.stats.useQuery({ topicId });
  useEffect(() => {
    const syncIdentity = () => setIdentity(getAnonymousIdentity());
    window.addEventListener("escape-index-nickname-change", syncIdentity);
    return () => window.removeEventListener("escape-index-nickname-change", syncIdentity);
  }, []);
  useEffect(() => {
    if (lastCommentSubmittedAt <= 0) return;
    const timer = window.setInterval(() => setRateLimitClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lastCommentSubmittedAt]);
  useEffect(() => {
    if (!emojiPickerOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!emojiPickerRef.current?.contains(event.target as Node)) setEmojiPickerOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [emojiPickerOpen]);
  const rateLimitSeconds = Math.ceil(Math.max(0, COMMENT_RATE_LIMIT_MS - (rateLimitClock - lastCommentSubmittedAt)) / 1000);
  const createComment = trpc.comments.create.useMutation({
    onSuccess: async () => {
      const submittedAt = Date.now();
      setBody("");
      setHasSpoiler(false);
      setRecommendationRating(0);
      setDifficultyRating(0);
      window.localStorage.setItem(COMMENT_LAST_SUBMITTED_KEY, String(submittedAt));
      setLastCommentSubmittedAt(submittedAt);
      setRateLimitClock(submittedAt);
      await utils.comments.list.invalidate({ topicId });
      await utils.comments.stats.invalidate({ topicId });
    },
  });
  const deleteComment = trpc.comments.delete.useMutation({
    onSuccess: async () => {
      await utils.comments.list.invalidate({ topicId });
      await utils.comments.stats.invalidate({ topicId });
    },
  });
  const updateComment = trpc.comments.update.useMutation({
    onSuccess: async () => {
      setEditingId(null);
      setEditingBody("");
      await utils.comments.list.invalidate({ topicId });
      await utils.comments.stats.invalidate({ topicId });
    },
  });

  const submitComment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody || !identity.token) return;
    if (rateLimitSeconds > 0) return;
    if (!window.localStorage.getItem(ANONYMOUS_NAME_KEY)?.trim()) {
      setPendingBody(trimmedBody);
      setPendingHasSpoiler(hasSpoiler);
      setPendingRecommendationRating(recommendationRating);
      setPendingDifficultyRating(difficultyRating);
      setNicknameOpen(true);
      return;
    }
    createComment.mutate({ topicId, body: trimmedBody, authorName: identity.name.trim(), anonymousToken: identity.token, avatarId: avatarForSeed(identity.avatarId, identity.token).id, hasSpoiler, recommendationRating, difficultyRating });
  };

  const confirmNicknameAndSend = (name: string, avatarId: string) => {
    window.localStorage.setItem(ANONYMOUS_NAME_KEY, name);
    window.localStorage.setItem(ANONYMOUS_AVATAR_KEY, avatarId);
    window.dispatchEvent(new CustomEvent("escape-index-nickname-change"));
    const nextBody = pendingBody.trim();
    setIdentity((current) => ({ ...current, name, avatarId }));
    setNicknameOpen(false);
    setPendingBody("");
    if (nextBody) createComment.mutate({ topicId, body: nextBody, authorName: name, anonymousToken: identity.token, avatarId: avatarForSeed(avatarId, identity.token).id, hasSpoiler: pendingHasSpoiler, recommendationRating: pendingRecommendationRating, difficultyRating: pendingDifficultyRating });
  };

  const currentToken = typeof window === "undefined"
    ? identity.token
    : window.localStorage.getItem(ANONYMOUS_TOKEN_KEY) || identity.token;

  const toggleHelpful = (commentId: number) => {
    const nextIds = helpfulCommentIds.includes(commentId)
      ? helpfulCommentIds.filter((id) => id !== commentId)
      : [...helpfulCommentIds, commentId];
    setHelpfulCommentIds(nextIds);
    saveHelpfulCommentIds(nextIds);
  };

  const revealSpoiler = (commentId: number) => {
    setRevealedSpoilerIds((current) => current.includes(commentId) ? current : [...current, commentId]);
  };

  const insertQuickEmoji = (emoji: string) => {
    const input = commentInputRef.current;
    const start = input?.selectionStart ?? body.length;
    const end = input?.selectionEnd ?? start;
    const nextBody = `${body.slice(0, start)}${emoji}${body.slice(end)}`;
    const nextCursor = start + emoji.length;
    setBody(nextBody);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <section aria-label={`《${topicName}》評論`} className="mt-6 border-t border-white/10 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-mono text-xs tracking-widest text-[#c89b5c] sm:text-sm">
          <MessageCircle size={16} /> 玩家評論
          {commentsQuery.data && <span className="text-white/40">({commentsQuery.data.length})</span>}
        </h4>
        <div className="flex flex-wrap justify-end gap-2 font-mono text-[10px] text-white/40">
          <span>推薦 {commentStatsQuery.data?.recommendationAverage ? `⭐ ${commentStatsQuery.data.recommendationAverage.toFixed(1)}` : "—"}</span>
          <span>難度 {commentStatsQuery.data?.difficultyAverage ? `🧩 ${commentStatsQuery.data.difficultyAverage.toFixed(1)}` : "—"}</span>
        </div>
      </div>

      {commentsQuery.isLoading && <p className="mt-3 text-xs text-white/45">正在載入評論⋯</p>}
      {commentsQuery.isError && <p className="mt-3 text-xs text-rose-200/80">評論暫時無法載入，請稍後再試。</p>}
      {!commentsQuery.isLoading && !commentsQuery.isError && commentsQuery.data?.length === 0 && (
        <p className="mt-3 text-xs leading-6 text-white/45">目前還沒有評論，歡迎成為第一位分享體驗的探索者。</p>
      )}
      {!!commentsQuery.data?.length && (
        <div className="mt-3 space-y-3">
          {commentsQuery.data.map((comment) => {
            const isOwnComment = comment.anonymousToken === currentToken;
            return (
            <article key={comment.id} className={`border p-3 transition ${isOwnComment ? "border-[#c89b5c] bg-[#2a2114]/75 shadow-[0_0_18px_rgba(200,155,92,0.18)]" : "border-white/10 bg-[#111412]/70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {(() => { const avatar = avatarForSeed(comment.avatarId, comment.anonymousToken || comment.authorName); const AvatarIcon = avatar.icon; return <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-[#202925] text-[#c89b5c]" aria-label={`${comment.authorName} 的角色頭像`}><AvatarIcon size={18} aria-hidden="true" /></span>; })()}
                  <div className="min-w-0">
                    <div className={`font-mono text-xs ${isOwnComment ? "font-bold text-[#e0bd83]" : "text-[#b7cdc7]"}`}>{comment.authorName}{isOwnComment && <span className="ml-1 font-bold text-[#f1c27d]">(你)</span>}</div>
                  <time className="mt-1 block font-mono text-[10px] text-white/35" dateTime={new Date(comment.createdAt).toISOString()}>
                    {new Date(comment.createdAt).toLocaleDateString("zh-TW")}
                    </time>
                  </div>
                </div>
                {isOwnComment && (
                  <div className="flex shrink-0 items-center gap-1">
                    {editingId !== comment.id && (
                      <button type="button" onClick={() => { setEditingId(comment.id); setEditingBody(comment.body); }} className="p-1 text-white/35 transition hover:text-[#e0bd83] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b5c]" aria-label="編輯我的評論" title="編輯我的評論">
                        <Pencil size={14} />
                      </button>
                    )}
                    <button type="button" onClick={() => { if (window.confirm("確定要刪除這則留言嗎？")) deleteComment.mutate({ id: comment.id, anonymousToken: currentToken }); }} disabled={deleteComment.isPending} className="p-1 text-white/35 transition hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b5c]" aria-label="刪除我的評論" title="刪除我的評論">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              {editingId === comment.id ? (
                <div className="mt-2 space-y-2">
                  <textarea aria-label={`編輯評論 ${comment.id}`} value={editingBody} onChange={(event) => setEditingBody(event.target.value)} maxLength={2000} rows={3} className="w-full resize-y border border-[#c89b5c]/60 bg-[#0c0e0d] px-3 py-2 text-xs leading-6 text-[#e8e4db] outline-none focus:border-[#c89b5c] focus:ring-1 focus:ring-[#c89b5c] sm:text-sm" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setEditingId(null); setEditingBody(""); }} className="border border-white/20 px-3 py-1.5 font-mono text-[10px] text-white/60 transition hover:border-white/40">取消</button>
                    <button type="button" onClick={() => { const nextBody = editingBody.trim(); if (nextBody) updateComment.mutate({ id: comment.id, body: nextBody, anonymousToken: currentToken }); }} disabled={updateComment.isPending || !editingBody.trim()} className="inline-flex items-center gap-1 border border-[#c89b5c]/70 bg-[#c89b5c] px-3 py-1.5 font-mono text-[10px] font-bold text-[#0c0e0d] disabled:opacity-45"><Save size={12} />儲存</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {comment.clearStatus === "success" && <span className="border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] text-emerald-200">成功通關</span>}
                    {comment.clearStatus === "failed" && <span className="border border-rose-300/30 bg-rose-400/10 px-2 py-0.5 font-mono text-[10px] text-rose-200">挑戰失敗</span>}
                    {comment.hasSpoiler && <span className="border border-[#c89b5c]/30 bg-[#c89b5c]/10 px-2 py-0.5 font-mono text-[10px] text-[#e0bd83]">含暴雷</span>}
                  </div>
                  {comment.hasSpoiler && !revealedSpoilerIds.includes(comment.id) ? (
                    <button type="button" onClick={() => revealSpoiler(comment.id)} aria-label={`顯示留言 ${comment.id} 的暴雷內容`} className="mt-2 w-full border border-[#c89b5c]/25 bg-[#0c0e0d]/75 px-3 py-3 text-left transition hover:border-[#c89b5c]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b5c]">
                      <span className="block select-none text-xs leading-6 text-white/70 blur-sm sm:text-sm">{comment.body}</span>
                      <span className="mt-2 block font-mono text-[10px] tracking-wider text-[#e0bd83]">點擊查看暴雷內容</span>
                    </button>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-white/70 sm:text-sm">{comment.body}</p>
                  )}
                </>
              )}
              <div className="mt-3 flex justify-end border-t border-white/10 pt-2">
                <button
                  type="button"
                  onClick={() => toggleHelpful(comment.id)}
                  aria-pressed={helpfulCommentIds.includes(comment.id)}
                  title={helpfulCommentIds.includes(comment.id) ? "收回讚" : "讚"}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b5c] ${helpfulCommentIds.includes(comment.id) ? "cursor-default text-[#c89b5c]" : "text-white/40 hover:text-[#e0bd83]"}`}
                >
                  <ThumbsUp size={13} fill={helpfulCommentIds.includes(comment.id) ? "currentColor" : "none"} />
                  讚
                </button>
              </div>
            </article>
            );
          })}
        </div>
      )}

      {deleteComment.isError && <p className="mt-3 text-xs text-rose-200/80">{deleteComment.error.message}</p>}
      {updateComment.isError && <p className="mt-3 text-xs text-rose-200/80">{updateComment.error.message}</p>}
      <form onSubmit={submitComment} className="mt-4 space-y-2">
        <label htmlFor={`comment-${topicId}`} className="sr-only">分享你對《{topicName}》的體驗</label>
        <textarea ref={commentInputRef} id={`comment-${topicId}`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={3} placeholder="分享你的實際遊玩體驗⋯（訪客即可留言）" className="min-h-[112px] w-full resize-y border border-white/15 bg-[#0c0e0d] px-3 py-2 text-xs leading-6 text-[#e8e4db] outline-none transition placeholder:text-white/30 focus:border-[#c89b5c] focus:ring-1 focus:ring-[#c89b5c] sm:min-h-0 sm:text-sm" />
        <div aria-label="快捷表情" className="flex items-center gap-1 border-x border-b border-white/10 bg-[#111412]/35 px-2 py-1.5">
          <div ref={emojiPickerRef} className="relative">
            <button type="button" onClick={() => setEmojiPickerOpen((open) => !open)} aria-expanded={emojiPickerOpen} aria-haspopup="dialog" className="inline-flex items-center gap-1 rounded border border-[#c89b5c]/30 px-2 py-1 font-mono text-xs text-[#d5e0dc] transition hover:border-[#c89b5c] hover:bg-[#c89b5c]/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c89b5c]">
              <span aria-hidden="true">😀</span> 表情
            </button>
            {emojiPickerOpen && (
              <div role="dialog" aria-label="Emoji 表情選擇器" className="absolute bottom-full left-0 z-20 mb-2 grid w-[min(19rem,calc(100vw-2rem))] grid-cols-9 gap-1 border border-white/15 bg-[#111412] p-2 shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
                {COMMENT_EMOJI_OPTIONS.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => { insertQuickEmoji(emoji); setEmojiPickerOpen(false); }} aria-label={`選擇表情${emoji}`} className="flex size-7 items-center justify-center rounded text-base transition hover:bg-[#c89b5c]/15 focus-visible:bg-[#c89b5c]/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c89b5c]">
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="mx-1 h-4 w-px bg-white/10" aria-hidden="true" />
          <span className="mr-1 font-mono text-xs text-white/45">快捷</span>
          {QUICK_COMMENT_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => insertQuickEmoji(emoji)} aria-label={`插入${emoji}`} className="flex size-7 items-center justify-center rounded border border-transparent text-base transition hover:border-[#c89b5c]/50 hover:bg-[#c89b5c]/10 focus-visible:border-[#c89b5c] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c89b5c]">
              {emoji}
            </button>
          ))}
        </div>
        <div className="grid gap-2 border border-white/10 bg-[#111412]/55 p-2.5 sm:grid-cols-2">
          <RatingInput label="推薦指數 ⭐️" value={recommendationRating} onChange={setRecommendationRating} />
          <RatingInput label="謎題難度 🧩" value={difficultyRating} onChange={setDifficultyRating} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-[#111412]/55 px-3 py-2.5">
          <label className="inline-flex cursor-pointer items-center gap-2 font-mono text-xs leading-5 text-white/65 transition hover:text-[#e0bd83]">
            <input type="checkbox" checked={hasSpoiler} onChange={(event) => setHasSpoiler(event.target.checked)} className="size-4 accent-[#c89b5c]" />
            <span>包含暴雷內容</span>
          </label>
          <span className="font-mono text-xs text-white/45">{body.length}/2000</span>
          <button type="submit" disabled={createComment.isPending || !body.trim() || rateLimitSeconds > 0} className="inline-flex items-center justify-center gap-2 border border-[#c89b5c]/70 bg-[#c89b5c] px-3 py-1.5 font-mono text-xs font-bold text-[#0c0e0d] transition hover:bg-[#e0bd83] disabled:cursor-not-allowed disabled:opacity-45">
            <Send size={14} /> {createComment.isPending ? "送出中⋯" : rateLimitSeconds > 0 ? `${rateLimitSeconds} 秒後可留言` : "發表評論"}
          </button>
        </div>
        <p className="text-xs leading-5 text-white/45">暱稱與匿名識別碼只儲存在本瀏覽器；請勿填寫個人敏感資料。</p>
        {rateLimitSeconds > 0 && <p className="text-xs text-[#e0bd83]">為避免重複發送，還需等待 {rateLimitSeconds} 秒。</p>}
        {createComment.isError && <p className="text-xs text-rose-200/80">{createComment.error.message}</p>}
      </form>
      <NicknameDialog open={nicknameOpen} initialName={identity.name || makeSuggestedName(identity.token)} initialAvatarId={identity.avatarId} onOpenChange={(open) => { setNicknameOpen(open); if (!open) { setPendingBody(""); setPendingHasSpoiler(false); setPendingRecommendationRating(0); setPendingDifficultyRating(0); } }} onConfirm={confirmNicknameAndSend} submitLabel="確認並發送留言" />
    </section>
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

function RatingInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border border-white/10 bg-[#111412]/45 px-3 py-2">
      <span className="font-mono text-xs text-white/65 sm:text-sm">{label}</span>
      <div className="flex items-center gap-0.5" role="group" aria-label={label}>
        {Array.from({ length: 5 }, (_, index) => {
          const rating = index + 1;
          return <button key={rating} type="button" onClick={() => onChange(value === rating ? 0 : rating)} aria-label={`${label} ${rating} 星`} aria-pressed={value >= rating} className="p-0.5 text-[#c89b5c] transition hover:scale-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c89b5c]"><Star size={18} fill={value >= rating ? "currentColor" : "none"} /></button>;
        })}
        <span className="ml-1 min-w-5 text-right font-mono text-xs text-white/45">{value || "—"}</span>
      </div>
    </div>
  );
}
