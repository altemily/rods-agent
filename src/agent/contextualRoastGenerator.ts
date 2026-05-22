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

function normalizeText(
  value: string | null | undefined,
  fallback = "não informado",
): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function normalizeRoastLevel(roastLevel: string): RoastTone {
  const normalized = roastLevel
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  if (
    normalized.includes("sem anestesia") ||
    normalized.includes("boleto vencido") ||
    normalized.includes("pesado")
  ) {
    return "NO_ANESTHESIA";
  }

  if (
    normalized.includes("fatura chegando") ||
    normalized.includes("controlado") ||
    normalized.includes("medio") ||
    normalized.includes("ácido") ||
    normalized.includes("acido")
  ) {
    return "CONTROLLED";
  }

  if (normalized.includes("direto") || normalized.includes("firme")) {
    return "DIRECT";
  }

  return "LIGHT";
}

function capToneForClassification(
  classification: FinancialTextClassification,
  profileTone: RoastTone,
): RoastTone {
  if (
    classification.intent === "REGISTER_INCOME" ||
    classification.intent === "REGISTER_BOX_CONTRIBUTION"
  ) {
    return profileTone === "LIGHT" ? "LIGHT" : "DIRECT";
  }

  if (classification.necessityLevel === "ESSENTIAL") {
    return "LIGHT";
  }

  if (
    classification.necessityLevel === "NECESSARY" &&
    profileTone === "NO_ANESTHESIA"
  ) {
    return "DIRECT";
  }

  return profileTone;
}

function hasSensitiveLimits(profile: CompletedOnboardingProfile): boolean {
  const limits = normalizeText(
    profile.sensitiveLimits,
    DEFAULT_SENSITIVE_LIMITS,
  ).toLowerCase();

  return ![
    "não informado",
    "nao informado",
    "pular",
    "nenhum",
    "não",
    "nao",
  ].includes(limits);
}

export class ContextualRoastGenerator {
  constructor(private readonly geminiService = new GeminiService()) {}

  async generate(input: ContextualRoastInput): Promise<ContextualRoast> {
    if (this.geminiService.isConfigured()) {
      try {
        const rawResponse = await this.geminiService.generateText(
          buildContextualRoastPrompt(input),
        );

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

  private buildFallbackRoast(
    input: ContextualRoastInput,
    tone: RoastTone,
  ): string {
    const goal = normalizeText(input.profile.mainGoal, "sua meta principal");
    const goalAmount = normalizeText(input.profile.goalAmount);
    const goalDeadline = normalizeText(input.profile.goalDeadline);

    const triggers = normalizeText(
      input.profile.spendingTriggers,
      "seus gatilhos de consumo",
    );

    const riskCategories = normalizeText(
      input.profile.riskCategories,
      "suas categorias de risco",
    );

    const category = normalizeText(
      input.classification.category,
      "essa categoria",
    );

    const amount = this.formatAmount(input.classification.amount);
    const notionStatus = this.formatNotionStatus(input.notionSaved);
    const incidentStatus = this.formatIncidentStatus(input.notionSaved);

    if (input.classification.intent === "REGISTER_INCOME") {
      return `Entrada de ${amount} ${notionStatus}. Boa: renda entrando combina com ${goal}. Agora a parte provocativa é simples: fazer esse dinheiro trabalhar pela meta, em vez de só assistir ele virar lembrança no extrato.`;
    }

    if (input.classification.intent === "REGISTER_BOX_CONTRIBUTION") {
      return `Contribuição de ${amount} ${notionStatus}. Isso conversa bem com sua meta de ${goal}${
        goalAmount !== "não informado" ? ` (${goalAmount})` : ""
      }${
        goalDeadline !== "não informado" ? ` no prazo de ${goalDeadline}` : ""
      }. Disciplina não faz barulho, mas costuma ganhar de impulso no placar final.`;
    }

    if (input.classification.necessityLevel === "ESSENTIAL") {
      return `Despesa essencial de ${amount} em ${category} ${notionStatus}. Aqui não cabe teatro de culpa: gasto básico precisa existir. O ponto útil é acompanhar se ele está cabendo junto das despesas fixas e da sua meta de ${goal}.`;
    }

    if (input.classification.necessityLevel === "NECESSARY") {
      return `Despesa necessária de ${amount} em ${category} ${notionStatus}. Não é vilã, mas também não merece cheque em branco. Como você citou ${riskCategories}, vale olhar se esse gasto está ajudando sua rotina ou só passando fantasiado de prioridade.`;
    }

    if (tone === "NO_ANESTHESIA") {
      return this.pickFallbackMessage(
        [
          `Amiga, esse gasto de ${amount} em ${category} foi uma vergonha financeira ${incidentStatus}. Você disse que ${triggers} mexem com seu bolso e que quer ${goal}; então vamos combinar que esse dinheiro não estava exatamente fazendo estágio obrigatório na sua meta.`,

          `Modo Boleto Vencido ativado: ${amount} em ${category} ${notionStatus}. Não vou dramatizar, mas isso tem energia de “eu mereço” seguido de arrependimento no extrato.`,

          `Amiga, o RODS viu ${amount} em ${category} e precisou respirar em silêncio por 3 segundos ${incidentStatus}. Sua meta de ${goal} estava ali, parada, assistindo esse gasto passar como quem vê o vilão entrando no segundo ato.`,

          `Despesa de ${amount} em ${category} ${notionStatus}. Você quer ${goal}, mas esse gasto veio com a mesma energia de quem abre o app do banco e fala “depois eu vejo”. Spoiler: depois dói.`,

          `RODS registrou ${amount} em ${category} e abriu um processo administrativo contra seu autocontrole. Você disse que ${triggers} mexem com seu bolso; esse gasto claramente usou essa informação contra você.`,

          `Amiga, esse gasto de ${amount} em ${category} não derruba sua vida financeira sozinho, mas também não veio para somar. Ele entrou no orçamento como figurante caro e ainda quis sentar na janela.`,

          `Despesa de ${amount} em ${category} ${notionStatus}. Se sua meta é ${goal}, esse gasto precisa se explicar melhor, porque no momento ele está com cara de “foi só dessa vez” número 47.`,

          `Modo Boleto Vencido informa: ${amount} em ${category} ${notionStatus}. Não estou dizendo que foi o fim do mundo, mas o seu orçamento certamente pediu para conversar em particular.`,
        ],
        input,
      );
    }

    if (tone === "CONTROLLED") {
      return this.pickFallbackMessage(
        [
          `Despesa de ${amount} em ${category} ${notionStatus}. Considerando seus gatilhos (${triggers}) e sua meta de ${goal}, isso tem cara de decisão que pede recibo e um pouco de vergonha operacional, no bom sentido.`,

          `Despesa de ${amount} em ${category} ${notionStatus}. Não é caso de sirene financeira, mas também não merece aplauso em pé. Vale conferir se isso ajuda sua rotina ou só alimenta ${riskCategories}.`,

          `Gasto de ${amount} em ${category} ${notionStatus}. O orçamento não gritou, mas levantou uma sobrancelha. Se isso virar padrão, sua meta de ${goal} vai começar a mandar indireta.`,

          `Despesa de ${amount} em ${category} ${notionStatus}. Sozinha, talvez passe. Repetida, vira personagem fixo no drama do extrato. Observa esse comportamento antes que ele ganhe temporada nova.`,

          `Gasto de ${amount} em ${category} ${notionStatus}. Não vou te julgar com violência, mas o RODS oficialmente colocou esse movimento em observação preventiva.`,
        ],
        input,
      );
    }

    if (tone === "DIRECT") {
      return this.pickFallbackMessage(
        [
          `Despesa de ${amount} em ${category} ${notionStatus}. Ela precisa conversar com sua meta de ${goal}; se virou padrão dentro de ${riskCategories}, o orçamento já está pedindo mais critério.`,

          `Despesa de ${amount} em ${category} ${notionStatus}. Direto ao ponto: esse gasto precisa justificar o espaço que está ocupando entre você e ${goal}.`,

          `Gasto de ${amount} em ${category} ${notionStatus}. Se isso resolve algo real, ok. Se foi só impulso fantasiado de necessidade, já temos um suspeito no extrato.`,

          `Despesa de ${amount} em ${category} ${notionStatus}. Seu dinheiro tem meta, prazo e destino. Esse gasto precisa provar que não foi só um desvio turístico no orçamento.`,

          `Gasto de ${amount} em ${category} ${notionStatus}. Se ele conversa com sua rotina, seguimos. Se conversa só com ${triggers}, aí o orçamento acabou de pedir uma reunião.`,
        ],
        input,
      );
    }

    return this.pickFallbackMessage(
      [
        `Despesa de ${amount} em ${category} ${notionStatus}. Vale observar se esse gasto combina com sua meta de ${goal} e com os gatilhos que você mesmo apontou: ${triggers}.`,

        `Gasto de ${amount} em ${category} ${notionStatus}. Sem drama por enquanto: só registra, observa e vê se isso está ajudando ou atrapalhando sua meta de ${goal}.`,

        `Despesa de ${amount} em ${category} ${notionStatus}. Pequeno ou grande, todo gasto conta uma história. Esse aqui precisa combinar com o plano, não só com o momento.`,

        `Gasto de ${amount} em ${category} ${notionStatus}. Fica o lembrete gentil do RODS: dinheiro que sai sem critério costuma fazer falta quando a meta chama pelo nome.`,
      ],
      input,
    );
  }

  private pickFallbackMessage(
    messages: string[],
    input: ContextualRoastInput,
  ): string {
    const fallbackMessage =
      "Movimentação registrada. O RODS analisou o contexto, mas preferiu não dramatizar agora. Aproveita esse raro momento de paz financeira.";

    if (messages.length === 0) {
      return fallbackMessage;
    }

    const seed = [
      input.classification.intent,
      input.classification.amount ?? "sem-valor",
      input.classification.category ?? "sem-categoria",
      input.classification.necessityLevel ?? "sem-nivel",
      input.profile.mainGoal,
      input.profile.spendingTriggers,
    ].join("|");

    const index = this.hashString(seed) % messages.length;

    return messages[index] ?? fallbackMessage;
  }

  private hashString(value: string): number {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }

    return hash;
  }

  private formatNotionStatus(notionSaved: boolean): string {
    return notionSaved
      ? "registrada no Notion"
      : "classificada, mas ainda sem registro concluído no Notion";
  }

  private formatIncidentStatus(notionSaved: boolean): string {
    return notionSaved
      ? "e já ficou registrada no Notion, para não fingir que nada aconteceu"
      : "mas ainda não consegui concluir o registro no Notion";
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