import type {
  DashboardApiRequest,
  DashboardApiResponse,
} from "../../src/http/dashboardApi";
import { setCorsHeaders } from "../../src/http/dashboardCors";
import { isDashboardSessionValid } from "../../src/http/dashboardSession";

export default async function handler(
  req: DashboardApiRequest,
  res: DashboardApiResponse,
) {
  setCorsHeaders(res, req, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    authenticated: isDashboardSessionValid(req),
  });
}
