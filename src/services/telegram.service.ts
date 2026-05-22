type TelegramSendMessageResponse = {
  ok: boolean;
  description?: string;
};

export class TelegramService {
  constructor(private readonly botToken = process.env.TELEGRAM_BOT_TOKEN) {}

  async sendMessage(chatId: string | number, text: string): Promise<void> {
    if (!this.botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is not configured");
    }

    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as TelegramSendMessageResponse | null;
      throw new Error(payload?.description ?? "Failed to send Telegram message");
    }
  }
}
