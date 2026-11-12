export type WechatHealth = {
  version: number;
  status: string;
  checked_at: string;
  last_success_at: string;
  last_full_success_at?: string;
  source_last_success_at?: string[];
  total_sources: number;
  succeeded_sources: number;
  failed_sources: number;
  resumed_sources: number;
  fetched_count: number;
  new_count: number;
  consecutive_failures: number;
  interval_hours?: number;
  stale_after_hours?: number;
};

export function healthView(health: WechatHealth | null, now: number) {
  if (!health) return { level: "unknown", label: "公众号同步状态待确认" };
  const cutoff = now - 48 * 3600_000;
  const recent = health.total_sources > 0 && Array.isArray(health.source_last_success_at)
    ? health.source_last_success_at.filter((value) => {
        const time = Date.parse(value);
        return time >= cutoff && time <= now;
      }).length
    : null;
  const coverage = recent === null ? "" : `最近成功：${recent}/${health.total_sources}（近 48 小时）`;
  const withCoverage = (label: string) => coverage ? `${label} · ${coverage}` : label;
  if (health.status === "auth_required" || health.status === "auth_missing")
    return { level: "error", label: withCoverage(health.status === "auth_missing" ? "公众号采集授权待配置" : "公众号登录需要重新授权") };
  if (health.status === "verification_required") return { level: "error", label: withCoverage("公众号采集需要微信验证") };
  const last = Date.parse(health.last_success_at);
  if (health.status === "ok" && !Number.isFinite(last)) return { level: "unknown", label: withCoverage("公众号最近成功时间待确认") };
  const staleHours = health.stale_after_hours ?? (health.interval_hours === 24 ? 32 : 8);
  if (Number.isFinite(last) && now - last > staleHours * 3600_000)
    return { level: "warning", label: withCoverage(`公众号同步延迟：已超过 ${staleHours} 小时未成功采集`) };
  if (recent !== null && (health.status === "ok" || health.status === "partial"))
    return { level: recent === health.total_sources ? "ok" : "warning", label: coverage };
  if (health.status === "ok") return { level: "ok", label: "公众号同步正常" };
  if (health.status === "partial") return { level: "warning", label: `公众号部分来源暂不可用（${health.succeeded_sources}/${health.total_sources} 正常）` };
  if (health.status === "rate_limited") return { level: "warning", label: withCoverage("公众号采集暂受上游限制，等待后续重试") };
  return { level: "warning", label: withCoverage("公众号采集暂未完成，已保留现有内容") };
}

export function beijingTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "尚无记录";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function sourceStatusLabel(source: { status: string; error_reason?: string }) {
  if (source.status === "ok") return "正常";
  if (source.status === "pending") return "本轮未请求，待轮换补采";
  const labels: Record<string, string> = { auth_required: "登录需重新授权", verification_required: "需要微信验证", rate_limited: "请求受限，等待重试", network: "网络暂不可用", empty_result: "暂未取得文章", not_checked: "本轮待补采", collector_error: "采集暂不可用" };
  return labels[source.error_reason || ""] || "暂不可用";
}
