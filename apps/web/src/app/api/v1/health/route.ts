import { jsonResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return jsonResponse({ status: "ok" }, { sMaxAge: 5 });
}
