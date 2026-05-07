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
    text?: unknown;
  };
};

const ONLINE_MESSAGE = "RODS online. Agora vamos calibrar seu radar financeiro.";

function parseTelegramUpdate(body: unknown): { chatId: string | number | undefined; text: string } {
  const update = body as TelegramUpdate;
  const chatId = update.message?.chat?.id;
  const text = typeof update.message?.text === "string" ? update.message.text : "";

  return { chatId, text };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { chatId, text } = parseTelegramUpdate(req.body);

  if (!chatId) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const telegramService = new TelegramService();

  await telegramService.sendMessage(chatId, ONLINE_MESSAGE);

  return res.status(200).json({
    ok: true,
    receivedText: text,
  });
}
