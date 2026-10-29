export type WechatHealth = {
  version: number;
  status: string;
  checked_at: string;
  last_success_at: string;
  last_full_success_at?: string;
  total_sources: number;
  succeeded_sources: number;
  failed_sources: number;
  resumed_sources: number;
  fetched_count: number;
  new_count: number;
  consecutive_failures: number;
};

export function healthView(health: WechatHealth | null, now: number) {
  if (!health) return { level: "unknown", label: "公众号同步状态待确认" };
  if (health.status === "auth_required" || health.status === "auth_missing")
    return { level: "error", label: health.status === "auth_missing" ? "公众号采集授权待配置" : "公众号登录需要重新授权" };
  if (health.status === "verification_required") return { level: "error", label: "公众号采集需要微信验证" };
  const last = Date.parse(health.last_success_at);
  if (health.status === "ok" && !Number.isFinite(last)) return { level: "unknown", label: "公众号最近成功时间待确认" };
  if (Number.isFinite(last) && now - last > 8 * 3600_000)
    return { level: "warning", label: "公众号同步延迟：已超过 8 小时未成功采集" };
  if (health.status === "ok") return { level: "ok", label: "公众号同步正常" };
  if (health.status === "partial") return { level: "warning", label: `公众号部分来源暂不可用（${health.succeeded_sources}/${health.total_sources} 正常）` };
  if (health.status === "rate_limited") return { level: "warning", label: "公众号采集暂受频率限制，等待后续重试" };
  return { level: "warning", label: "公众号采集暂未完成，已保留现有内容" };
}

export function beijingTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "尚无记录";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
