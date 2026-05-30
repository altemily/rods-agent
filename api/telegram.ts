import { RodsAgent } from "../src/agent/rodsAgent";
import { resolveTelegramUser } from "../src/config/telegramUsers";
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { chatId, userId, text } = parseTelegramUpdate(req.body);

  if (!chatId) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const telegramUser = resolveTelegramUser(userId);

  if (!telegramUser) {
    console.warn("Tentativa de acesso não autorizado ao bot.", {
      chatId,
      userId,
    });

    try {
      const telegramService = new TelegramService();
      await telegramService.sendMessage(
        chatId,
        "Este bot é de uso privado. Seu usuário não está autorizado.",
      );
    } catch {
      console.error("Não foi possível enviar a mensagem de acesso bloqueado.");
    }

    return res.status(200).json({
      ok: true,
      ignored: true,
      reason: "Unauthorized Telegram user",
    });
  }

  try {
    const telegramService = new TelegramService();
    const responseMessage = await rodsAgent.respond(chatId, text, telegramUser);

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
