import type {
  DashboardApiRequest,
  DashboardApiResponse,
} from "../../src/http/dashboardApi";
import { setCorsHeaders } from "../../src/http/dashboardCors";
import { createClearDashboardSessionCookie } from "../../src/http/dashboardSession";

export default async function handler(
  req: DashboardApiRequest,
  res: DashboardApiResponse,
) {
  setCorsHeaders(res, req, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Set-Cookie", createClearDashboardSessionCookie());

  return res.status(200).json({ authenticated: false });
}
