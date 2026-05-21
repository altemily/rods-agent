import { FinancialTextClassifier } from "./financialTextClassifier";
import { OnboardingAgent } from "./onboardingAgent";
import { NotionService, notionService as defaultNotionService } from "../services/notion.service";
import { ContextualRoastGenerator } from "./contextualRoastGenerator";
import type { FinancialTextClassification } from "./schemas";

type PersistableFinancialClassification = FinancialTextClassification & {
  intent: "REGISTER_EXPENSE" | "REGISTER_INCOME" | "REGISTER_BOX_CONTRIBUTION";
  amount: number;
  needsConfirmation: false;
};

export class RodsAgent {
  constructor(
    private readonly onboardingAgent = new OnboardingAgent(),
    private readonly financialTextClassifier = new FinancialTextClassifier(),
    private readonly notionService: NotionService = defaultNotionService,
    private readonly contextualRoastGenerator = new ContextualRoastGenerator(),
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

    if (command === "/devseed") {
      if (process.env.ENABLE_DEV_SEED !== "true") {
        return "Comando de desenvolvimento desativado neste ambiente.";
      }

      return this.onboardingAgent.seedCompletedProfile(chatId);
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

    if (!this.isPersistableClassification(result.classification)) {
      return this.formatClassificationPreview(result.classification, false);
    }

    const notionResult = await this.notionService.createMovement({
      telegramUserId: chatId,
      intent: result.classification.intent,
      amount: result.classification.amount,
      description: result.classification.description,
      category: result.classification.category,
      necessityLevel: result.classification.necessityLevel,
      boxName: result.classification.boxName,
      source: "TEXT",
    });

    const profile = this.onboardingAgent.getCompletedProfile(chatId);

    if (!profile) {
      return this.formatClassificationPreview(result.classification, notionResult.success);
    }

    const contextualRoast = await this.contextualRoastGenerator.generate({
      profile,
      classification: result.classification,
      notionSaved: notionResult.success,
    });

    return this.formatFinalResponse(result.classification, notionResult.success, contextualRoast.roast);
  }

  private isPersistableClassification(
    classification: FinancialTextClassification,
  ): classification is PersistableFinancialClassification {
    return (
      classification.intent !== "UNKNOWN" &&
      classification.confidence >= 0.7 &&
      classification.needsConfirmation === false &&
      classification.amount !== null
    );
  }

  private formatClassificationPreview(classification: FinancialTextClassification, notionSaved: boolean): string {
    return [
      "Classificação prévia do RODS:",
      `Tipo: ${this.formatIntent(classification.intent)}`,
      `Valor: ${this.formatAmount(classification.amount)}`,
      `Descrição: ${classification.description ?? "não informada"}`,
      `Categoria: ${classification.category ?? "não informada"}`,
      `Nível: ${this.formatNecessityLevel(classification.necessityLevel)}`,
      notionSaved
        ? "Status: registrado no Notion."
        : "Status: classificação feita, mas o registro no Notion não foi concluído.",
    ].join("\n");
  }

  private formatFinalResponse(
    classification: PersistableFinancialClassification,
    notionSaved: boolean,
    roast: string,
  ): string {
    return [
      notionSaved
        ? "Movimentação registrada no Notion."
        : "Movimentação classificada, mas o registro no Notion não foi concluído.",
      "",
      `Tipo: ${this.formatIntent(classification.intent)}`,
      `Valor: ${this.formatAmount(classification.amount)}`,
      `Categoria: ${classification.category ?? "não informada"}`,
      `Nível: ${this.formatNecessityLevel(classification.necessityLevel)}`,
      "",
      "RODS:",
      roast,
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
