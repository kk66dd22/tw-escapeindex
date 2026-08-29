import React from "react";
import { Link } from "wouter";
import SiteFooter from "./SiteFooter";

type PublicPageLayoutProps = {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
};

export default function PublicPageLayout({ eyebrow, title, intro, children }: PublicPageLayoutProps) {
  return (
    <div className="min-h-screen bg-[#0c0e0d] text-[#e8e4db] selection:bg-[#c89b5c] selection:text-[#0c0e0d]">
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.06] [background-image:linear-gradient(rgba(200,155,92,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(200,155,92,.35)_1px,transparent_1px)] [background-size:54px_54px]" />
      <header className="relative z-10 border-b border-white/10 bg-[#0c0e0d]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-4 lg:px-10">
          <Link href="/" className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b5c]">
            <img src="/manus-storage/brand-sigil_8091f515.png" className="h-10 w-10 object-contain" alt="全台密室逃脫精選導覽圖騰" />
            <span className="font-mono text-xs uppercase tracking-[.25em] text-[#c89b5c] sm:text-sm">
              The Escape Index<br /><b className="font-sans text-sm tracking-[.12em] text-[#e8e4db]">全台密室逃脫精選導覽</b>
            </span>
          </Link>
          <Link href="/" className="font-mono text-xs tracking-[.16em] text-white/55 transition hover:text-[#c89b5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b5c] sm:text-sm">返回主題資料庫</Link>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-[1000px] px-5 py-16 lg:px-10 lg:py-24">
        <div className="mb-12 max-w-3xl border-l-2 border-[#c89b5c] pl-5 sm:pl-7">
          <div className="mb-4 font-mono text-xs uppercase tracking-[.3em] text-[#c89b5c] sm:text-sm">{eyebrow}</div>
          <h1 className="font-serif text-5xl font-black leading-[1.05] tracking-tight text-[#f3efe7] sm:text-7xl">{title}</h1>
          <p className="mt-6 text-base leading-8 text-white/65 sm:text-lg">{intro}</p>
        </div>
        <div className="prose prose-invert prose-headings:font-serif prose-headings:text-[#f3efe7] prose-p:text-white/65 prose-p:leading-8 prose-li:text-white/65 prose-strong:text-[#f3efe7] max-w-none">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
