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
const RAW_RESPONSE_PREVIEW_LENGTH = 120;

type ClassifierLogStage =
  | "gemini-empty-response"
  | "json-extraction"
  | "json-parse"
  | "zod-validation"
  | "classifier";

function serializeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

function looksSensitive(text: string): boolean {
  const normalized = text.toLowerCase();

  return (
    /\b(api[_-]?key|token|secret|password|authorization|bearer|x-goog|telegram|notion|gemini)\b/i.test(normalized) ||
    /\b[A-Za-z0-9_-]{32,}\b/.test(text) ||
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(text)
  );
}

function buildSafeRawResponsePreview(rawText: string): string | undefined {
  if (!rawText || looksSensitive(rawText)) {
    return undefined;
  }

  return rawText.replace(/\s+/g, " ").trim().slice(0, RAW_RESPONSE_PREVIEW_LENGTH);
}

function logClassifierFailure(input: {
  stage: ClassifierLogStage;
  error: unknown;
  model: string;
  hasApiKey: boolean;
  rawResponse?: string;
}): void {
  console.error("[RODS][Classifier]", {
    stage: input.stage,
    model: input.model,
    hasApiKey: input.hasApiKey,
    error: serializeError(input.error),
    rawResponseLength: input.rawResponse?.length,
    rawResponsePreview: input.rawResponse ? buildSafeRawResponsePreview(input.rawResponse) : undefined,
  });
}

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
    '  "installmentLabel": string | null,',
    '  "installmentCurrent": number | null,',
    '  "installmentTotal": number | null,',
    '  "contractName": string | null,',
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
    "- Categoria Pets: racao, pet shop, veterinario, banho e tosa, remedio ou vacina de pet, brinquedos, acessorios, areia de gato e gastos com animais.",
    "- Categoria Dividas / Limpar Nome: acordos, divida antiga, SPC, Serasa, nome negativado, limpar nome, renegociacao e quitacao de pendencias.",
    "- Categoria Emprestimo: parcelas de emprestimos pessoais, bancarios, aplicativos de credito ou similares.",
    "- Categoria Consorcio / Financiamento: parcelas de consorcio ou financiamento de moto, carro, imovel ou bens por contrato.",
    "- Identifique parcelas em formatos como 01/12, 1/12, parcela 1 de 12, primeira de 12 ou paguei a parcela 3/10.",
    "- installmentLabel preserva o trecho da parcela, installmentCurrent e installmentTotal usam numeros.",
    "- contractName identifica o acordo ou contrato quando houver, como emprestimo Nubank, consorcio da moto ou acordo Serasa.",
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

function parseClassification(rawText: string, diagnostics: { model: string; hasApiKey: boolean }): FinancialTextClassification | null {
  if (!rawText.trim()) {
    logClassifierFailure({
      stage: "gemini-empty-response",
      error: new Error("Gemini returned an empty response"),
      ...diagnostics,
      rawResponse: rawText,
    });

    return null;
  }

  const jsonText = extractJson(rawText);

  if (!jsonText) {
    logClassifierFailure({
      stage: "json-extraction",
      error: new Error("Could not extract JSON from Gemini response"),
      ...diagnostics,
      rawResponse: rawText,
    });

    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch (error) {
    logClassifierFailure({
      stage: "json-parse",
      error,
      ...diagnostics,
      rawResponse: rawText,
    });

    return null;
  }

  try {
    return financialTextClassificationSchema.parse(parsed);
  } catch (error) {
    logClassifierFailure({
      stage: "zod-validation",
      error,
      ...diagnostics,
      rawResponse: rawText,
    });

    return null;
  }
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseAmount(value: string): number {
  const cleaned = value.trim();

  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }

  if (cleaned.includes(",")) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }

  return Number(cleaned);
}

function inferFallbackCategory(normalizedMessage: string): string {
  if (/racao|pet shop|petshop|veterinari|banho e tosa|remedio (?:de |do )?pet|vacina (?:de |do )?pet|areia de gato|animal/.test(normalizedMessage)) {
    return "Pets";
  }

  if (/acordo|divida antiga|spc|serasa|nome negativado|limpar (?:o )?nome|renegoci|quitacao de pendencia/.test(normalizedMessage)) {
    return "Dívidas / Limpar Nome";
  }

  if (/emprestimo|credito pessoal/.test(normalizedMessage)) {
    return "Empréstimo";
  }

  if (/consorcio|financiamento/.test(normalizedMessage)) {
    return "Consórcio / Financiamento";
  }

  if (/mercado|supermercado|feira|alimentacao|comida/.test(normalizedMessage)) {
    return "Alimentação";
  }

  if (/ifood|delivery|lanche|pizza|hamburguer|restaurante/.test(normalizedMessage)) {
    return "Delivery";
  }

  if (/uber|99|onibus|transporte|gasolina|combustivel/.test(normalizedMessage)) {
    return "Transporte";
  }

  if (/salario|pix recebido|recebi|renda|pagamento recebido/.test(normalizedMessage)) {
    return "Renda";
  }

  if (/caixinha|reserva|investimento|investi|guardei|poupei/.test(normalizedMessage)) {
    return "Reserva";
  }

  return "Outros";
}

function parseInstallment(message: string): {
  installmentLabel: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
} {
  const numericMatch = message.match(
    /\b(?:parcela\s*)?(\d{1,3})\s*\/\s*(\d{1,3})\b/i,
  );
  const textMatch = message.match(
    /\b(?:parcela\s*)?(\d{1,3})\s+de\s+(\d{1,3})\b/i,
  );
  const ordinalMatch = message.match(
    /\b(primeira|segunda|terceira|quarta|quinta|sexta|setima|oitava|nona|decima)\s+de\s+(\d{1,3})\b/i,
  );
  const ordinalValues: Record<string, number> = {
    primeira: 1,
    segunda: 2,
    terceira: 3,
    quarta: 4,
    quinta: 5,
    sexta: 6,
    setima: 7,
    oitava: 8,
    nona: 9,
    decima: 10,
  };

  if (numericMatch?.[1] && numericMatch[2]) {
    return {
      installmentLabel: numericMatch[0],
      installmentCurrent: Number(numericMatch[1]),
      installmentTotal: Number(numericMatch[2]),
    };
  }

  if (textMatch?.[1] && textMatch[2]) {
    return {
      installmentLabel: textMatch[0],
      installmentCurrent: Number(textMatch[1]),
      installmentTotal: Number(textMatch[2]),
    };
  }

  if (ordinalMatch?.[1] && ordinalMatch[2]) {
    return {
      installmentLabel: ordinalMatch[0],
      installmentCurrent: ordinalValues[normalizeText(ordinalMatch[1])] ?? null,
      installmentTotal: Number(ordinalMatch[2]),
    };
  }

  return {
    installmentLabel: null,
    installmentCurrent: null,
    installmentTotal: null,
  };
}

function inferContractName(message: string): string | null {
  const match = message.match(
    /\b(emprestimo|empréstimo|consorcio|consórcio|financiamento|acordo)\b[^,.;]*/i,
  );

  if (!match?.[0]) {
    return null;
  }

  return match[0]
    .replace(/\s+\b(?:parcela\s*)?\d{1,3}\s*\/\s*\d{1,3}\b.*$/i, "")
    .replace(/\s+\b(?:parcela\s*)?\d{1,3}\s+de\s+\d{1,3}\b.*$/i, "")
    .trim();
}

function inferFallbackNecessityLevel(normalizedMessage: string): FinancialTextClassification["necessityLevel"] {
  if (/veterinari|remedio (?:de |do )?pet|vacina (?:de |do )?pet/.test(normalizedMessage)) {
    return "ESSENTIAL";
  }

  if (/emprestimo|credito pessoal|consorcio|financiamento|acordo|divida antiga|spc|serasa|nome negativado|limpar (?:o )?nome|renegoci|quitacao de pendencia/.test(normalizedMessage)) {
    return "NECESSARY";
  }

  if (/racao|pet shop|petshop|banho e tosa|areia de gato|animal/.test(normalizedMessage)) {
    return "NECESSARY";
  }

  if (/mercado|supermercado|feira|remedio|farmacia|aluguel|energia|agua|internet/.test(normalizedMessage)) {
    return "ESSENTIAL";
  }

  if (/uber|99|onibus|transporte|gasolina|combustivel/.test(normalizedMessage)) {
    return "NECESSARY";
  }

  if (/ifood|delivery|lanche|pizza|hamburguer/.test(normalizedMessage)) {
    return "IMPULSIVE";
  }

  return "OPTIONAL";
}

function buildFallbackClassification(message: string): FinancialTextClassification | null {
  const amountMatch = message.match(/(?:r\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?|\d+\.\d{1,2})/i);

  if (!amountMatch?.[1]) {
    return null;
  }

  const amount = parseAmount(amountMatch[1]);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const normalizedMessage = normalizeText(message);
  const installment = parseInstallment(message);

  const isBoxContribution = /caixinha|reserva|investimento|investi|guardei|poupei/.test(normalizedMessage);

  const isIncome = /recebi|ganhei|salario|pix recebido|renda|entrada|pagamento recebido/.test(normalizedMessage);

  let intent: FinancialTextClassification["intent"] = "REGISTER_EXPENSE";

  if (isBoxContribution) {
    intent = "REGISTER_BOX_CONTRIBUTION";
  } else if (isIncome) {
    intent = "REGISTER_INCOME";
  }

  const description =
    message
      .replace(amountMatch[0], "")
      .replace(
        /\b(gastei|paguei|comprei|recebi|ganhei|coloquei|guardei|investi|reais|real|r\$|no|na|em|com|de|do|da|para|pra)\b/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim() || "Movimentação financeira";

  const classification: FinancialTextClassification = {
    intent,
    amount,
    description,
    category: inferFallbackCategory(normalizedMessage),
    necessityLevel: intent === "REGISTER_EXPENSE" ? inferFallbackNecessityLevel(normalizedMessage) : null,
    boxName: intent === "REGISTER_BOX_CONTRIBUTION" ? description : null,
    ...installment,
    contractName: inferContractName(message),
    confidence: 0.8,
    needsConfirmation: false,
    clarificationQuestion: null,
  };

  try {
    return financialTextClassificationSchema.parse(classification);
  } catch {
    return null;
  }
}

export class FinancialTextClassifier {
  constructor(private readonly geminiService = new GeminiService()) {}

  async classify(message: string): Promise<ClassificationResult> {
    const fallbackClassification = buildFallbackClassification(message);

    if (!this.geminiService.isConfigured()) {
      if (fallbackClassification) {
        return { status: "valid", classification: fallbackClassification };
      }

      return { status: "not_configured" };
    }

    const diagnostics = this.geminiService.getDiagnostics();

    try {
      const rawResponse = await this.geminiService.generateText(buildPrompt(message));
      const classification = parseClassification(rawResponse, diagnostics);

      if (!classification) {
        if (fallbackClassification) {
          return { status: "valid", classification: fallbackClassification };
        }

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
        if (fallbackClassification) {
          return { status: "valid", classification: fallbackClassification };
        }

        return {
          status: "needs_confirmation",
          message:
            classification.clarificationQuestion ??
            "Preciso confirmar melhor essa movimentação. Qual foi o valor, a categoria e o tipo?",
          classification,
        };
      }

      return { status: "valid", classification };
    } catch (error) {
      logClassifierFailure({
        stage: "classifier",
        error,
        ...diagnostics,
      });

      if (fallbackClassification) {
        return { status: "valid", classification: fallbackClassification };
      }

      return {
        status: "needs_confirmation",
        message: "Tive um problema ao classificar essa mensagem com IA. Pode reformular com valor, descrição e tipo da movimentação?",
      };
    }
  }
}
