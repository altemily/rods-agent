import { RodsAgent } from "../src/agent/rodsAgent";
import { TelegramService } from "../src/services/telegram.service";

type VercelRequest = {
  method?: string;
  body?: unknown;
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
};

const rodsAgent = new RodsAgent();

function parseTelegramUpdate(body: unknown): ParsedTelegramUpdate {
  const update = body as TelegramUpdate;

  const chatId = update.message?.chat?.id;
  const rawUserId = update.message?.from?.id;
  const userId = rawUserId ? String(rawUserId) : undefined;

  const text =
    typeof update.message?.text === "string" ? update.message.text : "";

  return { chatId, userId, text };
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { chatId, userId, text } = parseTelegramUpdate(req.body);

  if (!chatId) {
    return res.status(200).json({ ok: true, ignored: true });
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
    const responseMessage = await rodsAgent.respond(chatId, text);

    await telegramService.sendMessage(chatId, responseMessage);
  } catch {
    return res.status(200).json({
      ok: false,
      handled: true,
      error: "Failed to process Telegram update",
    });
  }

  return res.status(200).json({
    ok: true,
    receivedText: text,
  });
}