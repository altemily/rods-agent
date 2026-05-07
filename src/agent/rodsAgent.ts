import { FinancialTextClassifier } from "./financialTextClassifier";
import { OnboardingAgent } from "./onboardingAgent";
import type { FinancialTextClassification } from "./schemas";

export class RodsAgent {
  constructor(
    private readonly onboardingAgent = new OnboardingAgent(),
    private readonly financialTextClassifier = new FinancialTextClassifier(),
  ) {}

  async respond(chatId: string | number, message: string): Promise<string> {
    const normalizedMessage = message.trim();
    const command = normalizedMessage.toLowerCase();

    if (command === "/start") {
      return this.onboardingAgent.start(chatId);
    }

    if (command === "/reset") {
      return this.onboardingAgent.reset(chatId);
    }

    if (command === "/status") {
      return this.onboardingAgent.getStatus(chatId);
    }

    if (!this.onboardingAgent.isCompleted(chatId)) {
      return this.onboardingAgent.handleMessage(chatId, normalizedMessage);
    }

    const result = await this.financialTextClassifier.classify(normalizedMessage);

    if (result.status === "not_configured") {
      return "A classificação por IA ainda não está configurada. Defina GEMINI_API_KEY para ativar essa etapa.";
    }

    if (result.status === "unknown") {
      return "Não identifiquei uma movimentação financeira clara. Tente algo como: 'Gastei 42,90 no iFood'.";
    }

    if (result.status === "needs_confirmation") {
      return result.message;
    }

    return this.formatClassificationPreview(result.classification);
  }

  private formatClassificationPreview(classification: FinancialTextClassification): string {
    return [
      "Classificação prévia do RODS:",
      `Tipo: ${this.formatIntent(classification.intent)}`,
      `Valor: ${this.formatAmount(classification.amount)}`,
      `Descrição: ${classification.description ?? "não informada"}`,
      `Categoria: ${classification.category ?? "não informada"}`,
      `Nível: ${this.formatNecessityLevel(classification.necessityLevel)}`,
      "Status: ainda não registrado no Notion.",
    ].join("\n");
  }

  private formatIntent(intent: FinancialTextClassification["intent"]): string {
    const labels = {
      REGISTER_EXPENSE: "despesa",
      REGISTER_INCOME: "renda",
      REGISTER_BOX_CONTRIBUTION: "caixinha/investimento",
      UNKNOWN: "desconhecido",
    };

    return labels[intent];
  }

  private formatNecessityLevel(necessityLevel: FinancialTextClassification["necessityLevel"]): string {
    if (!necessityLevel) {
      return "não informado";
    }

    const labels = {
      ESSENTIAL: "essencial",
      NECESSARY: "necessário",
      OPTIONAL: "opcional",
      IMPULSIVE: "impulsivo",
    };

    return labels[necessityLevel];
  }

  private formatAmount(amount: number | null): string {
    if (amount === null) {
      return "não informado";
    }

    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(amount);
  }
}
