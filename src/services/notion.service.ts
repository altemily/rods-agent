import { Client } from "@notionhq/client";

type MovementIntent = "REGISTER_EXPENSE" | "REGISTER_INCOME" | "REGISTER_BOX_CONTRIBUTION";
type NecessityLevel = "ESSENTIAL" | "NECESSARY" | "OPTIONAL" | "IMPULSIVE" | null;

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

type NotionWriteResult = {
  success: boolean;
  pageId?: string;
  error?: string;
};

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

export class NotionService {
  private readonly client: Client | null;

  constructor(
    private readonly token = process.env.NOTION_TOKEN,
    private readonly movementsDatabaseId = process.env.NOTION_MOVEMENTS_DATABASE_ID,
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
    const necessityLevel = input.necessityLevel ? necessityLevelLabels[input.necessityLevel] : "Não informado";

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
          "Descrição": {
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
          "Nível": {
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
}

export const notionService = new NotionService();
