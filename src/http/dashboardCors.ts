import type {
  DashboardApiRequest,
  DashboardApiResponse,
} from "./dashboardApi";

const DEVELOPMENT_DASHBOARD_ORIGIN = "http://localhost:5173";

function getHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>([DEVELOPMENT_DASHBOARD_ORIGIN]);
  const configuredOrigin = process.env.DASHBOARD_ALLOWED_ORIGIN?.trim();

  if (configuredOrigin) {
    origins.add(configuredOrigin);
  }

  return origins;
}

export function setCorsHeaders(
  res: DashboardApiResponse,
  req: DashboardApiRequest,
  allowedMethods: string,
): void {
  const origin = getHeaderValue(req.headers?.origin);

  if (origin && getAllowedOrigins().has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", allowedMethods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
