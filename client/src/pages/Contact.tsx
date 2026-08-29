import { FormEvent, useState } from "react";
import PublicPageLayout from "@/components/PublicPageLayout";
import { trpc } from "@/lib/trpc";

export default function Contact() {
  const [sent, setSent] = useState(false);
  const submitContact = trpc.contact.submit.useMutation({
    onSuccess: () => setSent(true),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submitContact.mutate({
      name: String(form.get("name") || "").trim() || undefined,
      email: String(form.get("email") || "").trim(),
      subject: String(form.get("subject") || "資料回報"),
      message: String(form.get("message") || "").trim(),
    });
  };

  return (
    <PublicPageLayout
      eyebrow="CONTACT THE EDITORIAL DESK"
      title="聯絡我們"
      intro="發現資料需要更新、遇到失效連結，或想提供新的場館資訊？請留下可查證的線索，協助我們把導覽做得更準確。"
    >
      <div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr]">
        <div>
          <h2>適合回報的內容</h2>
          <p>你可以回報主題已結束、官方預約網址變更、場館資訊更新，或提出網站內容與使用體驗的建議。為方便查核，若能附上官方頁面網址會更有幫助。</p>
          <div className="border-l-2 border-[#5e8b92] pl-5 text-sm leading-7 text-white/55">
            我們不接受透過本表單處理預約、付款、退款或客訴；這些事項請直接聯絡對應場館或預約平台。
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 border border-white/10 bg-[#151917] p-6 sm:p-8">
          <div>
            <label htmlFor="contact-name" className="mb-2 block font-mono text-xs tracking-[.16em] text-[#c89b5c]">姓名（選填）</label>
            <input id="contact-name" name="name" type="text" maxLength={120} autoComplete="name" className="w-full border border-white/15 bg-[#0c0e0d] px-4 py-3 text-sm text-[#f3efe7] outline-none focus:border-[#c89b5c] focus:ring-1 focus:ring-[#c89b5c]/40" />
          </div>
          <div>
            <label htmlFor="contact-email" className="mb-2 block font-mono text-xs tracking-[.16em] text-[#c89b5c]">回覆信箱（選填）</label>
            <input id="contact-email" name="email" type="email" maxLength={320} autoComplete="email" className="w-full border border-white/15 bg-[#0c0e0d] px-4 py-3 text-sm text-[#f3efe7] outline-none focus:border-[#c89b5c] focus:ring-1 focus:ring-[#c89b5c]/40" />
          </div>
          <div>
            <label htmlFor="contact-subject" className="mb-2 block font-mono text-xs tracking-[.16em] text-[#c89b5c]">主旨</label>
            <select id="contact-subject" name="subject" defaultValue="資料回報" className="w-full border border-white/15 bg-[#0c0e0d] px-4 py-3 text-sm text-[#f3efe7] outline-none focus:border-[#c89b5c] focus:ring-1 focus:ring-[#c89b5c]/40">
              <option>資料回報</option><option>失效連結</option><option>合作詢問</option><option>其他建議</option>
            </select>
          </div>
          <div>
            <label htmlFor="contact-message" className="mb-2 block font-mono text-xs tracking-[.16em] text-[#c89b5c]">訊息</label>
            <textarea id="contact-message" name="message" required minLength={10} maxLength={5000} rows={6} className="w-full resize-y border border-white/15 bg-[#0c0e0d] px-4 py-3 text-sm leading-7 text-[#f3efe7] outline-none focus:border-[#c89b5c] focus:ring-1 focus:ring-[#c89b5c]/40" placeholder="請提供主題名稱、官方網址或希望我們確認的內容。" />
          </div>
          <button type="submit" disabled={submitContact.isPending} className="w-full bg-[#c89b5c] px-5 py-3 font-mono text-xs font-bold tracking-[.16em] text-[#0c0e0d] transition hover:bg-[#e0bd83] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b5c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151917] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50">{submitContact.isPending ? "傳送中…" : "送出訊息"}</button>
          {sent && <p role="status" className="text-sm leading-6 text-[#9bd3a7]">訊息已送出，感謝你協助維護資料品質。</p>}
          {submitContact.error && <p role="alert" className="text-sm leading-6 text-[#e5a198]">目前無法送出訊息，請稍後再試；若問題持續，請確認訊息至少包含 10 個字元。</p>}
          <p className="text-xs leading-6 text-white/35">請不要在表單中填寫密碼、付款資料或其他不必要的敏感資訊。送出內容只會用於處理你的網站回報。</p>
        </form>
      </div>
    </PublicPageLayout>
  );
}
