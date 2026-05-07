import { GeminiService } from "../services/gemini.service";
import { financialTextClassificationSchema, type FinancialTextClassification } from "./schemas";

type ClassificationResult =
  | {
      status: "valid";
      classification: FinancialTextClassification;
    }
  | {
      status: "needs_confirmation";
      message: string;
      classification?: FinancialTextClassification;
    }
  | {
      status: "unknown";
    }
  | {
      status: "not_configured";
    };

const LOW_CONFIDENCE_THRESHOLD = 0.7;

function buildPrompt(message: string): string {
  return [
    "Voce e um classificador de mensagens financeiras em texto para o RODS Agent.",
    "Retorne apenas JSON valido, sem explicacoes.",
    "",
    "Schema obrigatorio:",
    "{",
    '  "intent": "REGISTER_EXPENSE" | "REGISTER_INCOME" | "REGISTER_BOX_CONTRIBUTION" | "UNKNOWN",',
    '  "amount": number | null,',
    '  "description": string | null,',
    '  "category": string | null,',
    '  "necessityLevel": "ESSENTIAL" | "NECESSARY" | "OPTIONAL" | "IMPULSIVE" | null,',
    '  "boxName": string | null,',
    '  "confidence": number,',
    '  "needsConfirmation": boolean,',
    '  "clarificationQuestion": string | null',
    "}",
    "",
    "Regras:",
    "- REGISTER_EXPENSE: gastos, compras, pagamentos, despesas.",
    "- REGISTER_INCOME: salario, entrada, pix recebido, renda, pagamento recebido.",
    "- REGISTER_BOX_CONTRIBUTION: valor colocado em caixinha, reserva, investimento ou meta.",
    "- UNKNOWN: mensagem sem intencao financeira clara.",
    "- ESSENTIAL: saude, moradia, contas basicas, transporte necessario, alimentacao basica.",
    "- NECESSARY: algo util, mas nao vital.",
    "- OPTIONAL: lazer, conforto, compra nao essencial.",
    "- IMPULSIVE: compra emocional, delivery recorrente, compra por impulso, superfluo evidente.",
    "- Use null quando nao houver informacao suficiente.",
    "- Marque needsConfirmation como true quando faltar valor, descricao, categoria essencial para registrar, ou quando houver ambiguidade.",
    "",
    `Mensagem do usuario: ${JSON.stringify(message)}`,
  ].join("\n");
}

function extractJson(rawText: string): string | null {
  const trimmed = rawText.trim();
  const fencedJson = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedJson?.[1]) {
    return fencedJson[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function parseClassification(rawText: string): FinancialTextClassification | null {
  const jsonText = extractJson(rawText);

  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return financialTextClassificationSchema.parse(parsed);
  } catch {
    return null;
  }
}

export class FinancialTextClassifier {
  constructor(private readonly geminiService = new GeminiService()) {}

  async classify(message: string): Promise<ClassificationResult> {
    if (!this.geminiService.isConfigured()) {
      return { status: "not_configured" };
    }

    try {
      const rawResponse = await this.geminiService.generateText(buildPrompt(message));
      const classification = parseClassification(rawResponse);

      if (!classification) {
        return {
          status: "needs_confirmation",
          message: "Não consegui validar a classificação da IA. Pode confirmar o valor, categoria e se é gasto, renda ou caixinha?",
        };
      }

      if (classification.intent === "UNKNOWN") {
        return { status: "unknown" };
      }

      if (
        classification.confidence < LOW_CONFIDENCE_THRESHOLD ||
        classification.needsConfirmation ||
        classification.amount === null
      ) {
        return {
          status: "needs_confirmation",
          message:
            classification.clarificationQuestion ??
            "Preciso confirmar melhor essa movimentação. Qual foi o valor, a categoria e o tipo?",
          classification,
        };
      }

      return { status: "valid", classification };
    } catch {
      return {
        status: "needs_confirmation",
        message: "Tive um problema ao classificar essa mensagem com IA. Pode reformular com valor, descrição e tipo da movimentação?",
      };
    }
  }
}
