"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { beijingTime, healthView, type WechatHealth } from "@/lib/wechat-health";

export default function SyncStatus({ initial }: { initial: WechatHealth | null }) {
  const [health, setHealth] = useState(initial);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const controller = new AbortController();
    const refresh = async () => {
      update();
      try {
        const response = await fetch("/wechat-health.json", { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const value = await response.json();
          if (value?.version === 1 && typeof value.status === "string" && typeof value.last_success_at === "string") setHealth(value);
        }
      } catch { /* Keep the last known status if offline. */ }
    };
    void refresh();
    const timer = setInterval(update, 60_000);
    const poll = setInterval(() => void refresh(), 300_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); clearInterval(poll); controller.abort(); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const view = healthView(health, now || Date.parse(health?.checked_at || ""));
  const color = view.level === "ok" ? "text-emerald-800" : view.level === "error" ? "text-rose-800" : "text-amber-900";
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-amber-200/60 pt-2 text-xs ${color}`} role="status">
      <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{view.label}</span>
      {health?.last_success_at && <span>最近成功：{beijingTime(health.last_success_at)}（北京时间）</span>}
      <Link href="/sources/" className="underline underline-offset-2">查看更新状态</Link>
    </div>
  );
}
