import type {
  DashboardApiRequest,
  DashboardApiResponse,
} from "../../src/http/dashboardApi";
import { setCorsHeaders } from "../../src/http/dashboardCors";
import {
  createDashboardSessionCookie,
  isDashboardAuthConfigured,
  isValidDashboardPassword,
} from "../../src/http/dashboardSession";

type LoginBody = {
  password?: unknown;
};

function parseLoginBody(body: unknown): LoginBody {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as LoginBody;
    } catch {
      return {};
    }
  }

  if (typeof body === "object" && body !== null) {
    return body as LoginBody;
  }

  return {};
}

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

  if (!isDashboardAuthConfigured()) {
    return res.status(500).json({
      message: "Autenticação do dashboard não configurada.",
    });
  }

  const { password } = parseLoginBody(req.body);

  if (typeof password !== "string" || !isValidDashboardPassword(password)) {
    return res.status(401).json({ authenticated: false });
  }

  const sessionCookie = createDashboardSessionCookie();

  if (!sessionCookie) {
    return res.status(500).json({
      message: "Autenticação do dashboard não configurada.",
    });
  }

  res.setHeader("Set-Cookie", sessionCookie);

  return res.status(200).json({ authenticated: true });
}
