import { GeminiService } from "../services/gemini.service";
import { buildContextualRoastPrompt } from "./prompts";
import {
  contextualRoastSchema,
  type CompletedOnboardingProfile,
  type ContextualRoast,
  type FinancialTextClassification,
} from "./schemas";

type ContextualRoastInput = {
  profile: CompletedOnboardingProfile;
  classification: FinancialTextClassification;
  notionSaved: boolean;
};

type RoastTone = ContextualRoast["tone"];

const DEFAULT_SENSITIVE_LIMITS = "não informado";

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

function parseRoast(rawText: string): ContextualRoast | null {
  const jsonText = extractJson(rawText);

  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return contextualRoastSchema.parse(parsed);
  } catch {
    return null;
  }
}

function normalizeText(value: string | null | undefined, fallback = "não informado"): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function normalizeRoastLevel(roastLevel: string): RoastTone {
  const normalized = roastLevel
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  if (normalized.includes("sem anestesia") || normalized.includes("boleto vencido") || normalized.includes("pesado")) {
    return "NO_ANESTHESIA";
  }

  if (normalized.includes("controlado") || normalized.includes("medio") || normalized.includes("ácido") || normalized.includes("acido")) {
    return "CONTROLLED";
  }

  if (normalized.includes("direto") || normalized.includes("firme")) {
    return "DIRECT";
  }

  return "LIGHT";
}

function capToneForClassification(classification: FinancialTextClassification, profileTone: RoastTone): RoastTone {
  if (classification.intent === "REGISTER_INCOME" || classification.intent === "REGISTER_BOX_CONTRIBUTION") {
    return profileTone === "LIGHT" ? "LIGHT" : "DIRECT";
  }

  if (classification.necessityLevel === "ESSENTIAL") {
    return "LIGHT";
  }

  if (classification.necessityLevel === "NECESSARY" && profileTone === "NO_ANESTHESIA") {
    return "DIRECT";
  }

  return profileTone;
}

function hasSensitiveLimits(profile: CompletedOnboardingProfile): boolean {
  const limits = normalizeText(profile.sensitiveLimits, DEFAULT_SENSITIVE_LIMITS).toLowerCase();
  return !["não informado", "nao informado", "pular", "nenhum", "não", "nao"].includes(limits);
}

export class ContextualRoastGenerator {
  constructor(private readonly geminiService = new GeminiService()) {}

  async generate(input: ContextualRoastInput): Promise<ContextualRoast> {
    if (this.geminiService.isConfigured()) {
      try {
        const rawResponse = await this.geminiService.generateText(buildContextualRoastPrompt(input));
        const roast = parseRoast(rawResponse);

        if (roast) {
          return roast;
        }
      } catch {
        return this.buildFallback(input);
      }
    }

    return this.buildFallback(input);
  }

  private buildFallback(input: ContextualRoastInput): ContextualRoast {
    const profileTone = normalizeRoastLevel(input.profile.roastLevel);
    const tone = capToneForClassification(input.classification, profileTone);
    const roast = this.buildFallbackRoast(input, tone);
    const safetyNotes = hasSensitiveLimits(input.profile)
      ? "Fallback aplicado respeitando os limites sensíveis informados no onboarding."
      : "Fallback aplicado com regras gerais de segurança.";

    return {
      roast,
      tone,
      safetyNotes,
    };
  }

  private buildFallbackRoast(input: ContextualRoastInput, tone: RoastTone): string {
    const goal = normalizeText(input.profile.mainGoal, "sua meta principal");
    const goalAmount = normalizeText(input.profile.goalAmount);
    const goalDeadline = normalizeText(input.profile.goalDeadline);
    const triggers = normalizeText(input.profile.spendingTriggers, "seus gatilhos de consumo");
    const riskCategories = normalizeText(input.profile.riskCategories, "suas categorias de risco");
    const category = normalizeText(input.classification.category, "essa categoria");
    const amount = this.formatAmount(input.classification.amount);
    const notionStatus = input.notionSaved ? "registrada" : "classificada, mas ainda sem registro concluído no Notion";

    if (input.classification.intent === "REGISTER_INCOME") {
      return `Entrada de ${amount} ${notionStatus}. Boa: renda entrando combina com ${goal}. Agora a parte provocativa é simples: fazer esse dinheiro trabalhar pela meta, em vez de só assistir ele virar lembrança no extrato.`;
    }

    if (input.classification.intent === "REGISTER_BOX_CONTRIBUTION") {
      return `Contribuição de ${amount} ${notionStatus}. Isso conversa bem com sua meta de ${goal}${goalAmount !== "não informado" ? ` (${goalAmount})` : ""}${goalDeadline !== "não informado" ? ` no prazo de ${goalDeadline}` : ""}. Disciplina não faz barulho, mas costuma ganhar de impulso no placar final.`;
    }

    if (input.classification.necessityLevel === "ESSENTIAL") {
      return `Despesa essencial de ${amount} em ${category} ${notionStatus}. Aqui não cabe teatro de culpa: gasto básico precisa existir. O ponto útil é acompanhar se ele está cabendo junto das despesas fixas e da sua meta de ${goal}.`;
    }

    if (input.classification.necessityLevel === "NECESSARY") {
      return `Despesa necessária de ${amount} em ${category} ${notionStatus}. Não é vilã, mas também não merece cheque em branco. Como você citou ${riskCategories}, vale olhar se esse gasto está ajudando sua rotina ou só passando fantasiado de prioridade.`;
    }

    if (tone === "NO_ANESTHESIA") {
      return `Despesa de ${amount} em ${category} ${notionStatus}. Você disse que ${triggers} mexem com seu bolso e que quer ${goal}; esse gasto não derruba o plano sozinho, mas também não parece exatamente uma reunião estratégica com sua meta.`;
    }

    if (tone === "CONTROLLED") {
      return `Despesa de ${amount} em ${category} ${notionStatus}. Considerando seus gatilhos (${triggers}) e sua meta de ${goal}, isso tem cara de decisão que pede recibo e um pouco de vergonha operacional, no bom sentido.`;
    }

    if (tone === "DIRECT") {
      return `Despesa de ${amount} em ${category} ${notionStatus}. Ela precisa conversar com sua meta de ${goal}; se virou padrão dentro de ${riskCategories}, o orçamento já está pedindo mais critério.`;
    }

    return `Despesa de ${amount} em ${category} ${notionStatus}. Vale observar se esse gasto combina com sua meta de ${goal} e com os gatilhos que você mesmo apontou: ${triggers}.`;
  }

  private formatAmount(amount: number | null): string {
    if (amount === null) {
      return "valor não informado";
    }

    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(amount);
  }
}
