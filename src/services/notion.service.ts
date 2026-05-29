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
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

type NotionPage = {
  id: string;
  created_time?: string;
  properties?: Record<string, unknown>;
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

function getPlainTextFromItems(items: unknown): string {
  if (!Array.isArray(items)) {
    return "";
  }

  return items
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

function getTitleContent(property: unknown): string {
  if (
    typeof property === "object" &&
    property !== null &&
    "type" in property &&
    property.type === "title" &&
    "title" in property &&
    Array.isArray(property.title)
  ) {
    return getPlainTextFromItems(property.title);
  }

  return "";
}

function getPropertyText(property: unknown): string | null {
  if (typeof property !== "object" || property === null || !("type" in property)) {
    return null;
  }

  if (property.type === "title" && "title" in property) {
    return getPlainTextFromItems(property.title) || null;
  }

  if (property.type === "rich_text" && "rich_text" in property) {
    return getPlainTextFromItems(property.rich_text) || null;
  }

  if (
    property.type === "select" &&
    "select" in property &&
    property.select &&
    typeof property.select === "object" &&
    "name" in property.select &&
    typeof property.select.name === "string"
  ) {
    return property.select.name;
  }

  if (
    property.type === "status" &&
    "status" in property &&
    property.status &&
    typeof property.status === "object" &&
    "name" in property.status &&
    typeof property.status.name === "string"
  ) {
    return property.status.name;
  }

  if (
    property.type === "formula" &&
    "formula" in property &&
    property.formula &&
    typeof property.formula === "object" &&
    "type" in property.formula &&
    property.formula.type === "string" &&
    "string" in property.formula &&
    typeof property.formula.string === "string"
  ) {
    return property.formula.string;
  }

  return null;
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

  return getPropertyText(property);
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

  if (
    typeof property === "object" &&
    property !== null &&
    "type" in property &&
    property.type === "formula" &&
    "formula" in property &&
    property.formula &&
    typeof property.formula === "object" &&
    "type" in property.formula &&
    property.formula.type === "number" &&
    "number" in property.formula &&
    typeof property.formula.number === "number"
  ) {
    return property.formula.number;
  }

  if (
    typeof property === "object" &&
    property !== null &&
    "type" in property &&
    property.type === "rollup" &&
    "rollup" in property &&
    property.rollup &&
    typeof property.rollup === "object" &&
    "type" in property.rollup &&
    property.rollup.type === "number" &&
    "number" in property.rollup &&
    typeof property.rollup.number === "number"
  ) {
    return property.rollup.number;
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

function isProduction(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

function warnInvalidNotionField(
  section: string,
  pageId: string,
  field: string,
  message: string,
): void {
  if (isProduction()) {
    return;
  }

  console.warn("Invalid Notion dashboard field normalized", {
    section,
    pageId,
    field,
    message,
  });
}

function normalizeComparableLabel(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function mapMovementType(
  typeLabel: string | null,
  pageId: string,
): DashboardMovementType {
  if (!typeLabel?.trim()) {
    warnInvalidNotionField(
      "movements",
      pageId,
      "Tipo",
      "Missing movement type. Falling back to EXPENSE.",
    );

    return "EXPENSE";
  }

  const normalizedLabel = normalizeComparableLabel(typeLabel);

  if (
    normalizedLabel === "entrada" ||
    normalizedLabel === "receita" ||
    normalizedLabel === "income" ||
    normalizedLabel === "register_income"
  ) {
    return "INCOME";
  }

  if (
    normalizedLabel === "caixinha" ||
    normalizedLabel === "box_contribution" ||
    normalizedLabel === "register_box_contribution"
  ) {
    return "BOX_CONTRIBUTION";
  }

  if (
    normalizedLabel === "saida" ||
    normalizedLabel === "despesa" ||
    normalizedLabel === "expense" ||
    normalizedLabel === "register_expense"
  ) {
    return "EXPENSE";
  }

  warnInvalidNotionField(
    "movements",
    pageId,
    "Tipo",
    "Unknown movement type. Falling back to EXPENSE.",
  );

  return "EXPENSE";
}

function normalizeRequiredString(
  value: string | null,
  fallback: string,
  section: string,
  pageId: string,
  field: string,
): string {
  const normalizedValue = value?.trim();

  if (normalizedValue) {
    return normalizedValue;
  }

  warnInvalidNotionField(
    section,
    pageId,
    field,
    `Missing text value. Falling back to "${fallback}".`,
  );

  return fallback;
}

function normalizeNullableString(value: string | null): string | null {
  const normalizedValue = value?.trim();

  return normalizedValue || null;
}

function normalizeNumber(
  value: number | null,
  section: string,
  pageId: string,
  field: string,
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  warnInvalidNotionField(
    section,
    pageId,
    field,
    "Missing or invalid number. Falling back to 0.",
  );

  return 0;
}

function normalizeRequiredDateString(
  value: string | null,
  fallback: string | undefined,
  pageId: string,
): string {
  const normalizedValue = value?.trim();

  if (normalizedValue) {
    return normalizedValue;
  }

  const normalizedFallback = fallback?.trim();

  if (normalizedFallback) {
    warnInvalidNotionField(
      "movements",
      pageId,
      "Data",
      "Missing date. Falling back to page creation date.",
    );

    return normalizedFallback;
  }

  warnInvalidNotionField(
    "movements",
    pageId,
    "Data",
    "Missing date and page creation date. Falling back to current date.",
  );

  return new Date().toISOString();
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
      const title = normalizeNullableString(getTitleContent(properties.Name));
      const rawDescription =
        getPropertyText(properties["Descrição"]) ||
        title?.replace(/^(Despesa|Entrada|Receita|Saída|Caixinha)\s+-\s+/i, "") ||
        null;
      const description = normalizeRequiredString(
        rawDescription,
        "Movimentação sem descrição",
        "movements",
        page.id,
        "Descrição",
      );
      const amount = normalizeNumber(
        getNumberValue(properties.Valor),
        "movements",
        page.id,
        "Valor",
      );
      const type = mapMovementType(getSelectName(properties.Tipo), page.id);

      return {
        id: page.id,
        date: normalizeRequiredDateString(
          getDateStart(properties.Data),
          page.created_time,
          page.id,
        ),
        description,
        category: normalizeNullableString(getSelectName(properties.Categoria)),
        amount,
        type,
        necessityLevel: normalizeNullableString(
          getSelectName(properties["Nível"]),
        ),
        source: normalizeNullableString(getSelectName(properties.Origem)),
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
        description: normalizeRequiredString(
          getPropertyText(properties.Name) ||
            getPropertyText(properties["Descrição"]),
          "Fatura sem descrição",
          "invoices",
          page.id,
          "Descrição",
        ),
        amount: normalizeNumber(
          getNumberValue(properties.Valor),
          "invoices",
          page.id,
          "Valor",
        ),
        dueDate: getDateStart(properties.Vencimento),
        status: normalizeNullableString(getSelectName(properties.Status)),
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
      const currentAmount = normalizeNumber(
        getNumberValue(properties["Valor atual"]),
        "boxes",
        page.id,
        "Valor atual",
      );
      const rawTargetAmount = getNumberValue(properties.Meta);
      const targetAmount =
        rawTargetAmount === null
          ? null
          : normalizeNumber(rawTargetAmount, "boxes", page.id, "Meta");
      const progress =
        targetAmount && targetAmount > 0
          ? Math.min(100, (currentAmount / targetAmount) * 100)
          : 0;

      return {
        id: page.id,
        name: normalizeRequiredString(
          getPropertyText(properties.Name),
          "Caixinha",
          "boxes",
          page.id,
          "Name",
        ),
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
