import React from "react";
import { Link } from "wouter";

const footerLinks = [
  { href: "/about", label: "關於我們" },
  { href: "/privacy", label: "隱私權政策" },
  { href: "/contact", label: "聯絡我們" },
] as const;

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 px-5 py-8 lg:px-10">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 font-mono text-xs tracking-[.12em] text-white/45 sm:text-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <span>© 2026 The Escape Index · Taiwan</span>
          <span>為喜歡解謎的團隊而設</span>
        </div>
        <nav aria-label="網站資訊導覽" className="flex flex-wrap gap-x-6 gap-y-3 border-t border-white/10 pt-5">
          {footerLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-[#c89b5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b5c]">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

