import { loadWechatHealth } from "@/lib/data";

export const dynamic = "force-static";

export function GET() {
  return Response.json(loadWechatHealth());
}
