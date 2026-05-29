import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { DashboardApiRequest } from "./dashboardApi";

const SESSION_COOKIE_NAME = "rods_dashboard_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type DashboardSessionPayload = {
  sub: "dashboard";
  exp: number;
};

function getHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function hashString(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function secureStringEquals(a: string, b: string): boolean {
  return timingSafeEqual(hashString(a), hashString(b));
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function parseCookies(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");
    const rawValue = rawValueParts.join("=");

    if (!rawName || !rawValue) {
      continue;
    }

    try {
      cookies.set(rawName, decodeURIComponent(rawValue));
    } catch {
      cookies.set(rawName, rawValue);
    }
  }

  return cookies;
}

function getSessionSecret(): string | null {
  return process.env.DASHBOARD_SESSION_SECRET?.trim() || null;
}

function isProduction(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

export function isDashboardAuthConfigured(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD && getSessionSecret());
}

export function isValidDashboardPassword(password: string): boolean {
  const expectedPassword = process.env.DASHBOARD_PASSWORD;

  if (!expectedPassword) {
    return false;
  }

  return secureStringEquals(password, expectedPassword);
}

export function createDashboardSessionCookie(): string | null {
  const secret = getSessionSecret();

  if (!secret) {
    return null;
  }

  const payload: DashboardSessionPayload = {
    sub: "dashboard",
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = sign(encodedPayload, secret);
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodedPayload}.${signature}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];

  if (isProduction()) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function createClearDashboardSessionCookie(): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (isProduction()) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function isDashboardSessionValid(req: DashboardApiRequest): boolean {
  const secret = getSessionSecret();

  if (!secret) {
    return false;
  }

  const cookies = parseCookies(getHeaderValue(req.headers?.cookie));
  const token = cookies.get(SESSION_COOKIE_NAME);

  if (!token) {
    return false;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = sign(encodedPayload, secret);

  if (!secureStringEquals(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<DashboardSessionPayload>;

    return (
      payload.sub === "dashboard" &&
      typeof payload.exp === "number" &&
      payload.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
