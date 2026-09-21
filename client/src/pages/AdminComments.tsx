import { trpc } from "@/lib/trpc";
import { ArrowLeft, LogOut, Search, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useLocation } from "wouter";

const ADMIN_KEY_STORAGE = "escape-index-admin-key";

function readStoredAdminKey() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
}

export default function AdminComments() {
  const [, setLocation] = useLocation();
  const [adminKey, setAdminKey] = useState(readStoredAdminKey);
  const [keyDraft, setKeyDraft] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
  const hasKey = Boolean(adminKey);
  const commentsQuery = trpc.comments.adminList.useQuery(
    { adminKey, search },
    { enabled: hasKey, retry: false },
  );
  const deleteComment = trpc.comments.adminDelete.useMutation({
    onSuccess: async () => {
      await utils.comments.adminList.invalidate();
    },
  });

  const submitKey = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    window.sessionStorage.setItem(ADMIN_KEY_STORAGE, trimmed);
    setAdminKey(trimmed);
    setKeyDraft("");
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchDraft.trim());
  };

  const logout = () => {
    window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey("");
    setSearch("");
    setSearchDraft("");
  };

  const handleDelete = (id: number) => {
    if (!window.confirm("確定要永久刪除這則留言嗎？此操作無法復原。")) return;
    deleteComment.mutate({ adminKey, id });
  };

  if (!hasKey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0c0e0d] px-4 text-[#e8e4db]">
        <section className="w-full max-w-md border border-[#5e8b92]/50 bg-[#111412] p-6 shadow-2xl sm:p-8">
          <div className="mb-6 flex items-center gap-3 text-[#c89b5c]"><ShieldCheck size={22} /><h1 className="font-serif text-2xl font-bold">留言管理後台</h1></div>
          <p className="mb-5 text-sm leading-6 text-white/55">請輸入管理員密碼。密碼只會暫存在目前瀏覽器分頁的 sessionStorage。</p>
          <form onSubmit={submitKey} className="space-y-3">
            <label htmlFor="admin-key" className="font-mono text-xs text-[#b7cdc7]">ADMIN_SECRET_KEY</label>
            <input id="admin-key" type="password" autoComplete="current-password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} className="w-full border border-white/15 bg-[#0c0e0d] px-3 py-2.5 text-sm outline-none focus:border-[#c89b5c]" placeholder="輸入管理員密碼" />
            <button type="submit" className="w-full bg-[#c89b5c] px-4 py-2.5 font-mono text-xs font-bold text-[#0c0e0d] transition hover:bg-[#e0bd83]">登入管理後台</button>
          </form>
          <Link href="/" className="mt-6 inline-flex items-center gap-2 font-mono text-xs text-white/45 hover:text-[#c89b5c]"><ArrowLeft size={14} />返回網站</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0c0e0d] px-4 py-8 text-[#e8e4db] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-3 text-[#c89b5c]"><ShieldCheck size={22} /><h1 className="font-serif text-2xl font-bold sm:text-3xl">留言管理後台</h1></div><p className="mt-2 font-mono text-xs text-white/40">審核與管理匿名訪客留言</p></div>
          <div className="flex items-center gap-3"><Link href="/" className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 font-mono text-xs text-white/60 hover:border-[#c89b5c] hover:text-[#c89b5c]"><ArrowLeft size={14} />返回網站</Link><button type="button" onClick={logout} className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 font-mono text-xs text-white/60 hover:border-rose-300 hover:text-rose-200"><LogOut size={14} />登出</button></div>
        </header>

        <form onSubmit={submitSearch} className="mb-6 flex gap-2">
          <label htmlFor="comment-search" className="sr-only">搜尋留言</label>
          <input id="comment-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜尋主題、暱稱或留言內容" className="min-w-0 flex-1 border border-white/15 bg-[#111412] px-3 py-2.5 text-sm outline-none focus:border-[#c89b5c]" />
          <button type="submit" className="inline-flex items-center gap-2 bg-[#c89b5c] px-4 py-2.5 font-mono text-xs font-bold text-[#0c0e0d] hover:bg-[#e0bd83]"><Search size={15} />搜尋</button>
        </form>

        {commentsQuery.isError && <div className="border border-rose-300/30 bg-rose-950/20 p-4 text-sm text-rose-200">{commentsQuery.error.message}<button type="button" onClick={logout} className="ml-3 underline">重新登入</button></div>}
        {deleteComment.isError && <div className="mb-4 border border-rose-300/30 bg-rose-950/20 p-4 text-sm text-rose-200">{deleteComment.error.message}</div>}
        {commentsQuery.isLoading && <p className="text-sm text-white/45">正在載入留言⋯</p>}
        {!commentsQuery.isLoading && !commentsQuery.isError && commentsQuery.data?.length === 0 && <p className="border border-white/10 bg-[#111412] p-8 text-center text-sm text-white/45">目前沒有符合條件的留言。</p>}
        {!!commentsQuery.data?.length && (
          <div className="space-y-3">
            <div className="font-mono text-xs text-white/40">共 {commentsQuery.data.length} 則（最多顯示 500 則）</div>
            {commentsQuery.data.map((comment) => (
              <article key={comment.id} className="border border-white/10 bg-[#111412] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#c89b5c]"><span>#{comment.id}</span><span>{comment.authorName || "探索者"}</span><span className="text-white/35">· {comment.topicId}</span></div><time className="mt-1 block font-mono text-[10px] text-white/35">{new Date(comment.createdAt).toLocaleString("zh-TW")}</time></div>
                  <button type="button" onClick={() => handleDelete(comment.id)} disabled={deleteComment.isPending} className="inline-flex shrink-0 items-center justify-center gap-2 border border-rose-300/40 px-3 py-2 font-mono text-xs text-rose-200 hover:bg-rose-950/30 disabled:opacity-50"><Trash2 size={14} />一鍵刪除</button>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words border-l-2 border-[#c89b5c]/50 pl-3 text-sm leading-6 text-white/75">{comment.body}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
