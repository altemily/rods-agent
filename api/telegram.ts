import { RodsAgent } from "../src/agent/rodsAgent";
import { TelegramService } from "../src/services/telegram.service";

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type TelegramUpdate = {
  message?: {
    chat?: {
      id?: string | number;
    };
    from?: {
      id?: string | number;
      username?: string;
      first_name?: string;
    };
    text?: unknown;
  };
};

type ParsedTelegramUpdate = {
  chatId: string | number | undefined;
  userId: string | undefined;
  text: string;
  isTextMessage: boolean;
};

const rodsAgent = new RodsAgent();

const SENSITIVE_ENV_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
];

function parseTelegramUpdate(body: unknown): ParsedTelegramUpdate {
  const update = body as TelegramUpdate;

  const chatId = update.message?.chat?.id;
  const rawUserId = update.message?.from?.id;
  const userId = rawUserId ? String(rawUserId) : undefined;
  const rawText = update.message?.text;
  const isTextMessage = typeof rawText === "string";

  const text = isTextMessage ? rawText : "";

  return { chatId, userId, text, isTextMessage };
}

function getAllowedTelegramUserIds(): Set<string> {
  const rawAllowedIds = process.env.TELEGRAM_ALLOWED_USER_IDS ?? "";

  return new Set(
    rawAllowedIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

function isAuthorizedTelegramUser(userId: string | undefined): boolean {
  if (!userId) {
    return false;
  }

  const allowedUserIds = getAllowedTelegramUserIds();

  if (allowedUserIds.size === 0) {
    console.error(
      "TELEGRAM_ALLOWED_USER_IDS não configurado. Bloqueando acesso por segurança.",
    );

    return false;
  }

  return allowedUserIds.has(userId);
}

function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

function logDevelopment(message: string, metadata?: Record<string, unknown>): void {
  if (!isDevelopment()) {
    return;
  }

  console.log(`[RODS][Telegram] ${message}`, metadata ?? {});
}

function getHeader(
  headers: VercelRequest["headers"],
  name: string,
): string | undefined {
  const lowerCaseName = name.toLowerCase();
  const value = headers?.[name] ?? headers?.[lowerCaseName];
  const firstValue = Array.isArray(value) ? value[0] : value;

  return typeof firstValue === "string" ? firstValue : undefined;
}

function isAuthorizedWebhook(req: VercelRequest): boolean {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const receivedSecret = getHeader(
    req.headers,
    "X-Telegram-Bot-Api-Secret-Token",
  );

  logDevelopment("Webhook auth metadata", {
    hasSecretHeader: Boolean(receivedSecret),
    hasConfiguredSecret: Boolean(configuredSecret),
  });

  return Boolean(configuredSecret) && receivedSecret === configuredSecret;
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return SENSITIVE_ENV_KEYS.reduce((safeMessage, key) => {
    const value = process.env[key];

    if (!value) {
      return safeMessage;
    }

    return safeMessage.split(value).join("[redacted]");
  }, message);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  logDevelopment("Received request", { method: req.method });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorizedWebhook(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized webhook" });
  }

  const { chatId, userId, text, isTextMessage } = parseTelegramUpdate(req.body);

  logDevelopment("Parsed update", {
    fromId: userId,
    chatId,
    text,
    isTextMessage,
  });

  if (!chatId) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  if (!isTextMessage) {
    logDevelopment("Ignoring non-text Telegram update", {
      fromId: userId,
      chatId,
    });

    return res.status(200).json({
      ok: true,
      handled: false,
      ignored: true,
      reason: "Non-text Telegram update",
    });
  }

  if (!isAuthorizedTelegramUser(userId)) {
    console.warn("Tentativa de acesso não autorizado ao bot.", {
      chatId,
      userId,
    });

    return res.status(200).json({
      ok: true,
      ignored: true,
      reason: "Unauthorized Telegram user",
    });
  }

  try {
    const telegramService = new TelegramService();
    const agentResult = await rodsAgent.respondWithResult(chatId, text, userId);

    logDevelopment("Agent result", {
      userId,
      text,
      route: agentResult.route,
      onboardingCompleted: agentResult.onboardingCompleted,
      intent: agentResult.intent,
      supabaseAttempted: agentResult.supabaseAttempted,
      supabaseSaved: agentResult.supabaseSaved,
      error: agentResult.error ? sanitizeError(agentResult.error) : undefined,
    });

    await telegramService.sendMessage(chatId, agentResult.message);

    if (agentResult.supabaseAttempted && !agentResult.supabaseSaved) {
      logDevelopment("Supabase persistence failed", {
        userId,
        route: agentResult.route,
        intent: agentResult.intent,
        supabaseAttempted: agentResult.supabaseAttempted,
        supabaseSaved: agentResult.supabaseSaved,
        error: agentResult.error ? sanitizeError(agentResult.error) : undefined,
      });

      return res.status(200).json({
        ok: false,
        handled: true,
        error: "Failed to process Telegram update",
      });
    }
  } catch (error) {
    logDevelopment("Failed to process Telegram update", {
      error: sanitizeError(error),
    });

    return res.status(200).json({
      ok: false,
      handled: true,
      error: "Failed to process Telegram update",
    });
  }

  return res.status(200).json({
    ok: true,
    handled: true,
  });
}
