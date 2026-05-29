import { notionService } from "../src/services/notion.service";
import { performance } from "node:perf_hooks";
import type {
  DashboardApiRequest,
  DashboardApiResponse,
} from "../src/http/dashboardApi";
import { setCorsHeaders } from "../src/http/dashboardCors";
import { isDashboardSessionValid } from "../src/http/dashboardSession";
import type {
  DashboardAlert,
  DashboardCategory,
  DashboardHistoryItem,
  DashboardMovement,
  DashboardPayload,
  DashboardSummary,
} from "../src/types/dashboard";

const COMPETENCE_PATTERN = /^\d{4}-\d{2}$/;
const DASHBOARD_TIME_ZONE = "America/Fortaleza";
const DASHBOARD_CACHE_TTL_MS = 60_000;

type DashboardCacheEntry = {
  expiresAt: number;
  payload: DashboardPayload;
};

type DashboardPerformanceMetrics = {
  sessionValidationMs?: number;
  cacheLookupMs?: number;
  movementsReadMs?: number;
  historyMovementsReadMs?: number;
  invoicesReadMs?: number;
  boxesReadMs?: number;
  payloadBuildMs?: number;
  totalMs?: number;
  cacheHit?: boolean;
  invoicesSkipped?: boolean;
  boxesSkipped?: boolean;
};

const dashboardCache = new Map<string, DashboardCacheEntry>();

function isProduction(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

function isPerformanceLogEnabled(): boolean {
  return !isProduction();
}

function isDashboardCacheDisabled(): boolean {
  return process.env.DASHBOARD_CACHE_DISABLED === "true";
}

function getDashboardCacheKey(competence: string): string {
  return `dashboard:${competence}`;
}

function getCachedDashboardPayload(competence: string): DashboardPayload | null {
  if (isDashboardCacheDisabled()) {
    return null;
  }

  const cacheKey = getDashboardCacheKey(competence);
  const cached = dashboardCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    dashboardCache.delete(cacheKey);

    return null;
  }

  return cached.payload;
}

function setCachedDashboardPayload(
  competence: string,
  payload: DashboardPayload,
): void {
  if (isDashboardCacheDisabled()) {
    return;
  }

  dashboardCache.set(getDashboardCacheKey(competence), {
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    payload,
  });
}

function logDashboardPerformance(
  competence: string,
  metrics: DashboardPerformanceMetrics,
): void {
  if (!isPerformanceLogEnabled()) {
    return;
  }

  console.info("Dashboard performance", {
    competence,
    cacheDisabled: isDashboardCacheDisabled(),
    ...metrics,
  });
}

async function measureAsync<T>(
  setMetric: (durationMs: number) => void,
  operation: () => Promise<T>,
): Promise<T> {
  const start = performance.now();

  try {
    return await operation();
  } finally {
    setMetric(Number((performance.now() - start).toFixed(2)));
  }
}

function getCurrentCompetence(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return `${year}-${month}`;
}

function getQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function validateCompetence(competence: string): boolean {
  if (!COMPETENCE_PATTERN.test(competence)) {
    return false;
  }

  const month = Number(competence.slice(5, 7));

  return month >= 1 && month <= 12;
}

function getCompetenceRange(competence: string): { start: string; end: string } {
  const year = Number(competence.slice(0, 4));
  const month = Number(competence.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    start: `${competence}-01`,
    end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

function getHistoryRange(competence: string): { start: string; end: string } {
  const year = Number(competence.slice(0, 4));
  const monthIndex = Number(competence.slice(5, 7)) - 1;
  const start = new Date(Date.UTC(year, monthIndex - 5, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));

  return {
    start: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-01`,
    end: `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-01`,
  };
}

function getMovementSignedAmount(movement: DashboardMovement): number {
  if (movement.type === "INCOME") {
    return movement.amount;
  }

  return -movement.amount;
}

function calculateSummary(movements: DashboardMovement[]): DashboardSummary {
  const incomeTotal = movements
    .filter((movement) => movement.type === "INCOME")
    .reduce((total, movement) => total + movement.amount, 0);
  const expenseMovements = movements.filter(
    (movement) => movement.type !== "INCOME",
  );
  const expenseTotal = expenseMovements.reduce(
    (total, movement) => total + movement.amount,
    0,
  );
  const biggestExpenseMovement = expenseMovements.reduce<
    DashboardMovement | null
  >((biggest, movement) => {
    if (!biggest || movement.amount > biggest.amount) {
      return movement;
    }

    return biggest;
  }, null);

  return {
    incomeTotal,
    expenseTotal,
    balance: incomeTotal - expenseTotal,
    movementsCount: movements.length,
    biggestExpense: biggestExpenseMovement?.amount ?? 0,
    biggestExpenseDescription: biggestExpenseMovement?.description ?? null,
  };
}

function calculateCategories(
  movements: DashboardMovement[],
): DashboardCategory[] {
  const expenseMovements = movements.filter(
    (movement) => movement.type !== "INCOME",
  );
  const expenseTotal = expenseMovements.reduce(
    (total, movement) => total + movement.amount,
    0,
  );
  const totalsByCategory = new Map<string, number>();

  for (const movement of expenseMovements) {
    const category = movement.category ?? "Não categorizada";
    totalsByCategory.set(
      category,
      (totalsByCategory.get(category) ?? 0) + movement.amount,
    );
  }

  return [...totalsByCategory.entries()]
    .map(([name, total]) => ({
      name,
      total,
      percentage:
        expenseTotal > 0 ? Number(((total / expenseTotal) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function calculateHistory(
  movements: DashboardMovement[],
): DashboardHistoryItem[] {
  const totalsByCompetence = new Map<
    string,
    { incomeTotal: number; expenseTotal: number }
  >();

  for (const movement of movements) {
    const competence = movement.date.slice(0, 7);

    if (!validateCompetence(competence)) {
      continue;
    }

    const totals = totalsByCompetence.get(competence) ?? {
      incomeTotal: 0,
      expenseTotal: 0,
    };

    if (getMovementSignedAmount(movement) >= 0) {
      totals.incomeTotal += movement.amount;
    } else {
      totals.expenseTotal += movement.amount;
    }

    totalsByCompetence.set(competence, totals);
  }

  return [...totalsByCompetence.entries()]
    .map(([competence, totals]) => ({
      competence,
      incomeTotal: totals.incomeTotal,
      expenseTotal: totals.expenseTotal,
      balance: totals.incomeTotal - totals.expenseTotal,
    }))
    .sort((a, b) => a.competence.localeCompare(b.competence));
}

function buildAlerts(summary: DashboardSummary): DashboardAlert[] {
  if (summary.movementsCount === 0) {
    return [
      {
        id: "empty-competence",
        type: "info",
        title: "Sem movimentações",
        message: "Nenhuma movimentação encontrada para esta competência.",
      },
    ];
  }

  if (summary.balance < 0) {
    return [
      {
        id: "negative-balance",
        type: "warning",
        title: "Saldo negativo",
        message: "As saídas desta competência superam as entradas.",
      },
    ];
  }

  return [];
}

export default async function handler(
  req: DashboardApiRequest,
  res: DashboardApiResponse,
) {
  const endpointStart = performance.now();
  const metrics: DashboardPerformanceMetrics = {};

  setCorsHeaders(res, req, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionValidationStart = performance.now();
  const isAuthenticated = isDashboardSessionValid(req);
  metrics.sessionValidationMs = Number(
    (performance.now() - sessionValidationStart).toFixed(2),
  );

  if (!isAuthenticated) {
    metrics.totalMs = Number((performance.now() - endpointStart).toFixed(2));
    logDashboardPerformance("unauthenticated", metrics);

    return res.status(401).json({
      message: "Não autenticado.",
    });
  }

  const competence =
    getQueryValue(req.query?.competence) ?? getCurrentCompetence();

  if (!validateCompetence(competence)) {
    metrics.totalMs = Number((performance.now() - endpointStart).toFixed(2));
    logDashboardPerformance(competence, metrics);

    return res.status(400).json({
      error: "Invalid competence. Use YYYY-MM.",
    });
  }

  if (!process.env.NOTION_TOKEN) {
    metrics.totalMs = Number((performance.now() - endpointStart).toFixed(2));
    logDashboardPerformance(competence, metrics);

    return res.status(500).json({
      error: "Dashboard integration is not configured",
    });
  }

  try {
    const cacheLookupStart = performance.now();
    const cachedPayload = getCachedDashboardPayload(competence);
    metrics.cacheLookupMs = Number(
      (performance.now() - cacheLookupStart).toFixed(2),
    );

    if (cachedPayload) {
      metrics.cacheHit = true;
      metrics.totalMs = Number((performance.now() - endpointStart).toFixed(2));
      logDashboardPerformance(competence, metrics);

      return res.status(200).json(cachedPayload);
    }

    metrics.cacheHit = false;

    const range = getCompetenceRange(competence);
    const historyRange = getHistoryRange(competence);
    const invoicesPromise = process.env.NOTION_INVOICES_DATABASE_ID
      ? measureAsync(
          (durationMs) => {
            metrics.invoicesReadMs = durationMs;
          },
          () => notionService.listDashboardInvoices(),
        )
      : Promise.resolve([]);
    const boxesPromise = process.env.NOTION_BOXES_DATABASE_ID
      ? measureAsync(
          (durationMs) => {
            metrics.boxesReadMs = durationMs;
          },
          () => notionService.listDashboardBoxes(),
        )
      : Promise.resolve([]);

    metrics.invoicesSkipped = !process.env.NOTION_INVOICES_DATABASE_ID;
    metrics.boxesSkipped = !process.env.NOTION_BOXES_DATABASE_ID;

    const [movements, invoices, boxes, historyMovements] = await Promise.all([
      measureAsync(
        (durationMs) => {
          metrics.movementsReadMs = durationMs;
        },
        () => notionService.listDashboardMovements(range),
      ),
      invoicesPromise,
      boxesPromise,
      measureAsync(
        (durationMs) => {
          metrics.historyMovementsReadMs = durationMs;
        },
        () => notionService.listDashboardMovements(historyRange),
      ),
    ]);

    const payloadBuildStart = performance.now();
    const summary = calculateSummary(movements);
    const payload: DashboardPayload = {
      competence,
      summary,
      categories: calculateCategories(movements),
      movements,
      invoices,
      boxes,
      alerts: buildAlerts(summary),
      history: calculateHistory(historyMovements),
    };
    metrics.payloadBuildMs = Number(
      (performance.now() - payloadBuildStart).toFixed(2),
    );

    setCachedDashboardPayload(competence, payload);

    metrics.totalMs = Number((performance.now() - endpointStart).toFixed(2));
    logDashboardPerformance(competence, metrics);

    return res.status(200).json(payload);
  } catch (error) {
    console.error("Failed to build dashboard payload", error);
    metrics.totalMs = Number((performance.now() - endpointStart).toFixed(2));
    logDashboardPerformance(competence, metrics);

    return res.status(502).json({
      error: "Failed to load dashboard data",
    });
  }
}
