export type TelegramUser = {
  id: string;
  name: string;
};

function parseConfiguredUsers(rawUsers: string): Map<string, TelegramUser> {
  try {
    const parsed = JSON.parse(rawUsers) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object");
    }

    return new Map(
      Object.entries(parsed)
        .filter(
          (entry): entry is [string, string] =>
            Boolean(entry[0].trim()) &&
            typeof entry[1] === "string" &&
            Boolean(entry[1].trim()),
        )
        .map(([id, name]) => [
          id.trim(),
          {
            id: id.trim(),
            name: name.trim(),
          },
        ]),
    );
  } catch (error) {
    console.error("ALLOWED_TELEGRAM_USERS inválido. Use um objeto JSON.", error);
    return new Map();
  }
}

function parseLegacyUsers(rawAllowedIds: string): Map<string, TelegramUser> {
  return new Map(
    rawAllowedIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => [
        id,
        {
          id,
          name: id,
        },
      ]),
  );
}

export function getAllowedTelegramUsers(): Map<string, TelegramUser> {
  const configuredUsers = process.env.ALLOWED_TELEGRAM_USERS?.trim();

  if (configuredUsers) {
    return parseConfiguredUsers(configuredUsers);
  }

  return parseLegacyUsers(process.env.TELEGRAM_ALLOWED_USER_IDS ?? "");
}

export function resolveTelegramUser(
  telegramUserId: string | undefined,
): TelegramUser | null {
  if (!telegramUserId) {
    return null;
  }

  return getAllowedTelegramUsers().get(telegramUserId) ?? null;
}
