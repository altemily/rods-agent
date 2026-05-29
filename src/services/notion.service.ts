import { Client } from "@notionhq/client";
import type {
  DashboardBox,
  DashboardInvoice,
  DashboardMovement,
  DashboardMovementType,
} from "../types/dashboard";

type MovementIntent =
  | "REGISTER_EXPENSE"
  | "REGISTER_INCOME"
  | "REGISTER_BOX_CONTRIBUTION";

type NecessityLevel =
  | "ESSENTIAL"
  | "NECESSARY"
  | "OPTIONAL"
  | "IMPULSIVE"
  | null;

type CreateMovementInput = {
  telegramUserId: string | number;
  intent: MovementIntent;
  amount: number;
  description: string | null;
  category: string | null;
  necessityLevel: NecessityLevel;
  boxName: string | null;
  source: "TEXT";
};

type SaveUserProfileInput = {
  telegramUserId: string | number;
  status: "ONBOARDING_STARTED" | "ONBOARDING_COMPLETED";
  profile: unknown;
};

type StoredUserProfile = {
  pageId: string;
  telegramUserId: string;
  status: "ONBOARDING_STARTED" | "ONBOARDING_COMPLETED";
  profile: unknown;
};

type NotionWriteResult = {
  success: boolean;
  pageId?: string;
  error?: string;
};

type NotionQueryResponse = {
  results?: Array<{
    id: string;
    properties?: Record<string, unknown>;
  }>;
  has_more?: boolean;
  next_cursor?: string | null;
};

type NotionDateRangeFilter = {
  start: string;
  end: string;
};

const NOTION_VERSION = "2022-06-28";

const intentLabels: Record<MovementIntent, string> = {
  REGISTER_EXPENSE: "Despesa",
  REGISTER_INCOME: "Entrada",
  REGISTER_BOX_CONTRIBUTION: "Caixinha",
};

const necessityLevelLabels: Record<Exclude<NecessityLevel, null>, string> = {
  ESSENTIAL: "Essencial",
  NECESSARY: "Necessária",
  OPTIONAL: "Opcional",
  IMPULSIVE: "Impulsiva",
};

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getRichTextContent(property: unknown): string {
  if (
    typeof property === "object" &&
    property !== null &&
    "type" in property &&
    property.type === "rich_text" &&
    "rich_text" in property &&
    Array.isArray(property.rich_text)
  ) {
    return property.rich_text
      .map((item) => {
        if (
          typeof item === "object" &&
          item !== null &&
          "plain_text" in item &&
          typeof item.plain_text === "string"
        ) {
          return item.plain_text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

function getTitleContent(property: unknown): string {
  if (
    typeof property === "object" &&
    property !== null &&
    "type" in property &&
    property.type === "title" &&
    "title" in property &&
    Array.isArray(property.title)
  ) {
    return property.title
      .map((item) => {
        if (
          typeof item === "object" &&
          item !== null &&
          "plain_text" in item &&
          typeof item.plain_text === "string"
        ) {
          return item.plain_text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

function getSelectName(property: unknown): string | null {
  if (
    typeof property === "object" &&
    property !== null &&
    "type" in property &&
    property.type === "select" &&
    "select" in property &&
    property.select &&
    typeof property.select === "object" &&
    "name" in property.select &&
    typeof property.select.name === "string"
  ) {
    return property.select.name;
  }

  return null;
}

function getNumberValue(property: unknown): number | null {
  if (
    typeof property === "object" &&
    property !== null &&
    "type" in property &&
    property.type === "number" &&
    "number" in property &&
    typeof property.number === "number"
  ) {
    return property.number;
  }

  return null;
}

function getDateStart(property: unknown): string | null {
  if (
    typeof property === "object" &&
    property !== null &&
    "type" in property &&
    property.type === "date" &&
    "date" in property &&
    property.date &&
    typeof property.date === "object" &&
    "start" in property.date &&
    typeof property.date.start === "string"
  ) {
    return property.date.start;
  }

  return null;
}

function mapMovementType(typeLabel: string | null): DashboardMovementType {
  if (typeLabel === "Entrada") {
    return "INCOME";
  }

  if (typeLabel === "Caixinha") {
    return "BOX_CONTRIBUTION";
  }

  return "EXPENSE";
}

function isMissingNotionDatabaseError(status: number, body: string): boolean {
  return status === 404 || body.includes("object_not_found");
}

export class NotionService {
  private readonly client: Client | null;

  constructor(
    private readonly token = process.env.NOTION_TOKEN,
    private readonly movementsDatabaseId = process.env.NOTION_MOVEMENTS_DATABASE_ID,
    private readonly usersDatabaseId = process.env.NOTION_USERS_DATABASE_ID,
    private readonly invoicesDatabaseId = process.env.NOTION_INVOICES_DATABASE_ID,
    private readonly boxesDatabaseId = process.env.NOTION_BOXES_DATABASE_ID,
  ) {
    this.client = token ? new Client({ auth: token }) : null;
  }

  async createMovement(input: CreateMovementInput): Promise<NotionWriteResult> {
    if (!this.client || !this.token) {
      return {
        success: false,
        error: "NOTION_TOKEN is not configured",
      };
    }

    if (!this.movementsDatabaseId) {
      return {
        success: false,
        error: "NOTION_MOVEMENTS_DATABASE_ID is not configured",
      };
    }

    const description = input.description?.trim() || "Sem descrição";
    const category = input.category?.trim() || "Não categorizada";
    const boxName = input.boxName?.trim() || "";
    const typeLabel = intentLabels[input.intent];
    const necessityLevel = input.necessityLevel
      ? necessityLevelLabels[input.necessityLevel]
      : "Não informado";

    try {
      const page = await this.client.pages.create({
        parent: {
          database_id: this.movementsDatabaseId,
        },
        properties: {
          Name: {
            title: [
              {
                text: {
                  content: `${typeLabel} - ${description}`,
                },
              },
            ],
          },
          "Telegram User ID": {
            rich_text: [
              {
                text: {
                  content: String(input.telegramUserId),
                },
              },
            ],
          },
          Tipo: {
            select: {
              name: typeLabel,
            },
          },
          Valor: {
            number: input.amount,
          },
          Descrição: {
            rich_text: [
              {
                text: {
                  content: description,
                },
              },
            ],
          },
          Categoria: {
            select: {
              name: category,
            },
          },
          Nível: {
            select: {
              name: necessityLevel,
            },
          },
          Caixinha: {
            rich_text: boxName
              ? [
                  {
                    text: {
                      content: boxName,
                    },
                  },
                ]
              : [],
          },
          Origem: {
            select: {
              name: input.source,
            },
          },
          Data: {
            date: {
              start: new Date().toISOString(),
            },
          },
          Status: {
            select: {
              name: "Registrado",
            },
          },
        },
      });

      return {
        success: true,
        pageId: page.id,
      };
    } catch (error) {
      console.error("Failed to create Notion movement", error);

      return {
        success: false,
        error: "Failed to create Notion movement",
      };
    }
  }

  async saveUserProfile(
    input: SaveUserProfileInput,
  ): Promise<NotionWriteResult> {
    if (!this.client || !this.token) {
      return {
        success: false,
        error: "NOTION_TOKEN is not configured",
      };
    }

    if (!this.usersDatabaseId) {
      return {
        success: false,
        error: "NOTION_USERS_DATABASE_ID is not configured",
      };
    }

    const telegramUserId = String(input.telegramUserId);
    const profileJson = safeJsonStringify(input.profile);
    const now = new Date().toISOString();

    try {
      const existingProfile =
        await this.findUserProfileByTelegramId(telegramUserId);

      if (existingProfile) {
        const updatedPage = await this.client.pages.update({
          page_id: existingProfile.pageId,
          properties: {
            Status: {
              select: {
                name: input.status,
              },
            },
            "Profile JSON": {
              rich_text: [
                {
                  text: {
                    content: profileJson,
                  },
                },
              ],
            },
            "Updated At": {
              date: {
                start: now,
              },
            },
          },
        });

        return {
          success: true,
          pageId: updatedPage.id,
        };
      }

      const page = await this.client.pages.create({
        parent: {
          database_id: this.usersDatabaseId,
        },
        properties: {
          Name: {
            title: [
              {
                text: {
                  content: telegramUserId,
                },
              },
            ],
          },
          Status: {
            select: {
              name: input.status,
            },
          },
          "Profile JSON": {
            rich_text: [
              {
                text: {
                  content: profileJson,
                },
              },
            ],
          },
          "Created At": {
            date: {
              start: now,
            },
          },
          "Updated At": {
            date: {
              start: now,
            },
          },
        },
      });

      return {
        success: true,
        pageId: page.id,
      };
    } catch (error) {
      console.error("Failed to save Notion user profile", error);

      return {
        success: false,
        error: "Failed to save Notion user profile",
      };
    }
  }

  async findUserProfileByTelegramId(
    telegramUserId: string | number,
  ): Promise<StoredUserProfile | null> {
    if (!this.token || !this.usersDatabaseId) {
      return null;
    }

    try {
      const response = await fetch(
        `https://api.notion.com/v1/databases/${this.usersDatabaseId}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            "Notion-Version": NOTION_VERSION,
          },
          body: JSON.stringify({
            filter: {
              property: "Name",
              title: {
                equals: String(telegramUserId),
              },
            },
            page_size: 1,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();

        console.error("Failed to query Notion user profile", {
          status: response.status,
          body: errorBody.slice(0, 500),
        });

        return null;
      }

      const data = (await response.json()) as NotionQueryResponse;
      const page = data.results?.[0];

      if (!page?.properties) {
        return null;
      }

      const status = getSelectName(page.properties.Status);
      const profileJson = getRichTextContent(page.properties["Profile JSON"]);

      if (
        status !== "ONBOARDING_STARTED" &&
        status !== "ONBOARDING_COMPLETED"
      ) {
        return null;
      }

      return {
        pageId: page.id,
        telegramUserId: String(telegramUserId),
        status,
        profile: safeJsonParse(profileJson),
      };
    } catch (error) {
      console.error("Failed to find Notion user profile", error);

      return null;
    }
  }

  async listDashboardMovements(
    range?: NotionDateRangeFilter,
  ): Promise<DashboardMovement[]> {
    if (!this.token || !this.movementsDatabaseId) {
      return [];
    }

    const filter = range
      ? {
          and: [
            {
              property: "Data",
              date: {
                on_or_after: range.start,
              },
            },
            {
              property: "Data",
              date: {
                before: range.end,
              },
            },
          ],
        }
      : undefined;

    const pages = await this.queryDatabasePages(this.movementsDatabaseId, {
      filter,
      sorts: [
        {
          property: "Data",
          direction: "descending",
        },
      ],
    });

    return pages.map((page) => {
      const properties = page.properties ?? {};
      const title = getTitleContent(properties.Name);
      const description =
        getRichTextContent(properties["Descrição"]).trim() ||
        title.replace(/^(Despesa|Entrada|Caixinha)\s+-\s+/i, "").trim() ||
        "Sem descrição";
      const amount = getNumberValue(properties.Valor) ?? 0;
      const type = mapMovementType(getSelectName(properties.Tipo));

      return {
        id: page.id,
        date: getDateStart(properties.Data) ?? "",
        description,
        category: getSelectName(properties.Categoria),
        amount,
        type,
        necessityLevel: getSelectName(properties["Nível"]),
        source: getSelectName(properties.Origem),
      };
    });
  }

  async listDashboardInvoices(): Promise<DashboardInvoice[]> {
    if (!this.token || !this.invoicesDatabaseId) {
      return [];
    }

    const pages = await this.queryDatabasePages(this.invoicesDatabaseId, {
      sorts: [
        {
          property: "Vencimento",
          direction: "ascending",
        },
      ],
    });

    return pages.map((page) => {
      const properties = page.properties ?? {};

      return {
        id: page.id,
        description:
          getTitleContent(properties.Name) ||
          getRichTextContent(properties["Descrição"]) ||
          "Sem descrição",
        amount: getNumberValue(properties.Valor) ?? 0,
        dueDate: getDateStart(properties.Vencimento),
        status: getSelectName(properties.Status),
        paidAt: getDateStart(properties["Pago em"]),
      };
    });
  }

  async listDashboardBoxes(): Promise<DashboardBox[]> {
    if (!this.token || !this.boxesDatabaseId) {
      return [];
    }

    const pages = await this.queryDatabasePages(this.boxesDatabaseId, {});

    return pages.map((page) => {
      const properties = page.properties ?? {};
      const currentAmount = getNumberValue(properties["Valor atual"]) ?? 0;
      const targetAmount = getNumberValue(properties.Meta);
      const progress =
        targetAmount && targetAmount > 0
          ? Math.min(100, (currentAmount / targetAmount) * 100)
          : 0;

      return {
        id: page.id,
        name: getTitleContent(properties.Name) || "Caixinha",
        currentAmount,
        targetAmount,
        progress: Number(progress.toFixed(2)),
      };
    });
  }

  private async queryDatabasePages(
    databaseId: string,
    body: Record<string, unknown>,
  ): Promise<NonNullable<NotionQueryResponse["results"]>> {
    const pages: NonNullable<NotionQueryResponse["results"]> = [];
    let startCursor: string | undefined;

    do {
      const response = await fetch(
        `https://api.notion.com/v1/databases/${databaseId}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            "Notion-Version": NOTION_VERSION,
          },
          body: JSON.stringify({
            ...body,
            page_size: 100,
            ...(startCursor ? { start_cursor: startCursor } : {}),
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();

        if (isMissingNotionDatabaseError(response.status, errorBody)) {
          return [];
        }

        console.error("Failed to query Notion database", {
          status: response.status,
          body: errorBody.slice(0, 500),
        });

        throw new Error("Failed to query Notion database");
      }

      const data = (await response.json()) as NotionQueryResponse;

      pages.push(...(data.results ?? []));
      startCursor = data.next_cursor ?? undefined;

      if (!data.has_more) {
        startCursor = undefined;
      }
    } while (startCursor);

    return pages;
  }
}

export const notionService = new NotionService();
