import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Database, Rss } from "lucide-react";
import { loadItems, loadWechatHealth } from "@/lib/data";
import SyncStatus from "./components/SyncStatus";
import "./globals.css";

export const metadata: Metadata = {
  title: "不南知道 NJU Know",
  description: "南京大学校园活动与通知聚合",
};

const NAV = [
  { href: "/calendar/", label: "活动日历", icon: CalendarDays },
  { href: "/sources/", label: "信息源", icon: Database },
  { href: "/rss.xml", label: "RSS", icon: Rss },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  const updated = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const latestWechat = loadItems()
    .flatMap((item) => item.origins)
    .filter((item) => item.channel === "公众号")
    .reduce((latest, item) => (item.date > latest ? item.date : latest), "");
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only">跳转至通知列表</a>
        <header className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center gap-4 px-6 pt-6 pb-2">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--nju)] text-xl font-black text-white shadow-md shadow-[var(--nju)]/30">
              南
            </span>
            <span className="text-xl font-black tracking-tight text-[var(--nju)] sm:text-3xl">
              「不南知道」<span className="ml-1 font-extrabold">NJU Know</span>
            </span>
          </Link>
          <nav className="flex w-full gap-2 sm:ml-auto sm:w-auto">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm text-[var(--nju)] ring-1 ring-stone-200 transition hover:ring-[var(--nju)]"
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1680px] flex-1 px-6 py-4">
          <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <p>
            信息请以原发布单位为准。
            {latestWechat && ` 公众号收录文章的最新发布日期：${latestWechat}。`}
            </p>
            <SyncStatus initial={loadWechatHealth()} />
          </div>
          {children}
        </main>
        <footer className="px-6 py-8 text-center text-xs leading-6 text-stone-500">
          <p>页面构建于 {updated} · 内容版权归原发布单位所有</p>
          <p>
            产品形态与分类体系参考{" "}
            <a href="https://pkuknow.cn" className="underline" target="_blank" rel="noreferrer">
              「北大知道」PKU Know
            </a>
            （开发：涂增基，合作贡献：杨宣风、时豪），在此致谢。本站为独立实现，未使用其源码与素材。
          </p>
        </footer>
      </body>
    </html>
  );
}
