import { FinancialTextClassifier } from "./financialTextClassifier";
import { OnboardingAgent } from "./onboardingAgent";
import {
  SupabaseMovementService,
  supabaseMovementService as defaultSupabaseMovementService,
} from "../services/supabaseMovement.service";
import { ContextualRoastGenerator } from "./contextualRoastGenerator";
import type { FinancialTextClassification } from "./schemas";

type PersistableFinancialClassification = FinancialTextClassification & {
  intent:
    | "REGISTER_EXPENSE"
    | "REGISTER_INCOME"
    | "REGISTER_BOX_CONTRIBUTION";
  amount: number;
  needsConfirmation: false;
};

export type RodsAgentResult = {
  message: string;
  intent?: FinancialTextClassification["intent"];
  supabaseAttempted: boolean;
  supabaseSaved: boolean;
  onboardingCompleted: boolean;
  route?: "onboarding" | "financial" | "unknown" | "devseed";
  error?: string;
};

export class RodsAgent {
  constructor(
    private readonly onboardingAgent = new OnboardingAgent(),
    private readonly financialTextClassifier = new FinancialTextClassifier(),
    private readonly supabaseMovementService: SupabaseMovementService = defaultSupabaseMovementService,
    private readonly contextualRoastGenerator = new ContextualRoastGenerator(),
  ) {}

  async respond(
    chatId: string | number,
    message: string,
    telegramUserId: string | number | undefined = chatId,
  ): Promise<string> {
    const result = await this.respondWithResult(chatId, message, telegramUserId);

    return result.message;
  }

  async respondWithResult(
    chatId: string | number,
    message: string,
    telegramUserId: string | number | undefined = chatId,
  ): Promise<RodsAgentResult> {
    const userStateId = telegramUserId ?? chatId;
    const normalizedMessage = message.trim();
    const command = normalizedMessage.toLowerCase();
    const onboardingCompleted = this.isOnboardingCompletedForFlow(userStateId);
    const canUseSupabaseFinancialFlow =
      this.canUseSupabaseFinancialFlow(telegramUserId);

    if (command === "/start") {
      const response = this.onboardingAgent.start(userStateId);

      return this.toResult(response, {
        route: "onboarding",
        onboardingCompleted: this.isOnboardingCompletedForFlow(userStateId),
      });
    }

    if (command === "/reset") {
      const response = this.onboardingAgent.reset(userStateId);

      return this.toResult(response, {
        route: "onboarding",
        onboardingCompleted: false,
      });
    }

    if (command === "/status") {
      return this.toResult(this.onboardingAgent.getStatus(userStateId), {
        route: "onboarding",
        onboardingCompleted,
      });
    }

    if (command === "/devseed") {
      if (process.env.ENABLE_DEV_SEED !== "true") {
        return this.toResult(
          "Comando de desenvolvimento desativado neste ambiente.",
          {
            route: "devseed",
            onboardingCompleted,
          },
        );
      }

      const response = this.onboardingAgent.seedCompletedProfile(userStateId);

      return this.toResult(response, {
        route: "devseed",
        onboardingCompleted: true,
      });
    }

    if (!onboardingCompleted && !canUseSupabaseFinancialFlow) {
      const response = this.onboardingAgent.handleMessage(
        userStateId,
        normalizedMessage,
      );

      return this.toResult(response, {
        route: "onboarding",
        onboardingCompleted: this.isOnboardingCompletedForFlow(userStateId),
      });
    }

    const result = await this.financialTextClassifier.classify(normalizedMessage);

    if (result.status === "not_configured") {
      return this.toResult(
        "A classificação por IA ainda não está configurada. Defina GEMINI_API_KEY para ativar essa etapa.",
        {
          route: "financial",
          onboardingCompleted: onboardingCompleted || canUseSupabaseFinancialFlow,
        },
      );
    }

    if (result.status === "unknown") {
      if (!onboardingCompleted && !canUseSupabaseFinancialFlow) {
        const response = this.onboardingAgent.handleMessage(
          userStateId,
          normalizedMessage,
        );

        return this.toResult(response, {
          route: "onboarding",
          onboardingCompleted: this.isOnboardingCompletedForFlow(userStateId),
        });
      }

      return this.toResult(
        "Não identifiquei uma movimentação financeira clara. Tente algo como: 'Gastei 42,90 no iFood'.",
        {
          route: "unknown",
          onboardingCompleted: onboardingCompleted || canUseSupabaseFinancialFlow,
        },
      );
    }

    if (result.status === "needs_confirmation") {
      return this.toResult(
        result.message,
        result.classification
          ? {
              intent: result.classification.intent,
              route: "financial",
              onboardingCompleted:
                onboardingCompleted || canUseSupabaseFinancialFlow,
            }
          : {
              route: "financial",
              onboardingCompleted:
                onboardingCompleted || canUseSupabaseFinancialFlow,
            },
      );
    }

    if (!this.isPersistableClassification(result.classification)) {
      return this.toResult(
        this.formatClassificationPreview(result.classification, false, "Supabase"),
        {
          intent: result.classification.intent,
          route: "financial",
          onboardingCompleted: onboardingCompleted || canUseSupabaseFinancialFlow,
        },
      );
    }

    const persistenceResult = await this.persistMovement({
      telegramUserId,
      intent: result.classification.intent,
      amount: result.classification.amount,
      description: result.classification.description,
      category: result.classification.category,
      necessityLevel: result.classification.necessityLevel,
      boxName: result.classification.boxName,
      source: "telegram_agent",
    });

    if (!persistenceResult.success) {
      const error = persistenceResult.error ?? "Unknown Supabase error";

      return this.toResult(this.formatPersistenceFailure(result.classification), {
        intent: result.classification.intent,
        route: "financial",
        onboardingCompleted: onboardingCompleted || canUseSupabaseFinancialFlow,
        supabaseAttempted: true,
        supabaseSaved: false,
        error,
      });
    }

    const profile = this.onboardingAgent.getCompletedProfile(userStateId);

    if (!profile) {
      return this.toResult(
        this.formatClassificationPreview(
          result.classification,
          persistenceResult.success,
          persistenceResult.target,
        ),
        {
          intent: result.classification.intent,
          route: "financial",
          onboardingCompleted: onboardingCompleted || canUseSupabaseFinancialFlow,
          supabaseAttempted: true,
          supabaseSaved: persistenceResult.success,
        },
      );
    }

    const contextualRoast = await this.contextualRoastGenerator.generate({
      profile,
      classification: result.classification,
      persistenceSaved: persistenceResult.success,
      persistenceTarget: persistenceResult.target,
    });

    return this.toResult(
      this.formatFinalResponse(
        result.classification,
        persistenceResult.success,
        persistenceResult.target,
        contextualRoast.roast,
      ),
      {
        intent: result.classification.intent,
        route: "financial",
        onboardingCompleted: true,
        supabaseAttempted: true,
        supabaseSaved: persistenceResult.success,
      },
    );
  }

  private toResult(
    message: string,
    details: Partial<Omit<RodsAgentResult, "message">> = {},
  ): RodsAgentResult {
    return {
      message,
      supabaseAttempted: false,
      supabaseSaved: false,
      onboardingCompleted: false,
      ...details,
    };
  }

  private isOnboardingCompletedForFlow(
    userStateId: string | number | undefined,
  ): boolean {
    if (userStateId === undefined) {
      return false;
    }

    if (this.onboardingAgent.isCompleted(userStateId)) {
      return true;
    }

    return this.canBypassOnboardingInDevelopment(userStateId);
  }

  private canBypassOnboardingInDevelopment(
    userStateId: string | number | undefined,
  ): boolean {
    if (process.env.ENABLE_DEV_SEED !== "true") {
      return false;
    }

    if (process.env.NODE_ENV === "production") {
      return false;
    }

    return String(userStateId ?? "").trim().length > 0;
  }

  private canUseSupabaseFinancialFlow(
    telegramUserId: string | number | undefined,
  ): boolean {
    if (!telegramUserId) {
      return false;
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return false;
    }

    const normalizedTelegramUserId = String(telegramUserId).trim();

    if (!normalizedTelegramUserId) {
      return false;
    }

    const allowedUserIds = this.parseCommaSeparatedEnv(
      process.env.TELEGRAM_ALLOWED_USER_IDS,
    );

    if (allowedUserIds.length > 0) {
      return allowedUserIds.includes(normalizedTelegramUserId);
    }

    return Boolean(process.env.SUPABASE_TELEGRAM_USER_KEY_MAP?.trim());
  }

  private parseCommaSeparatedEnv(rawValue: string | undefined): string[] {
    return (rawValue ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
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

  private async persistMovement(input: {
    telegramUserId: string | number | undefined;
    intent: PersistableFinancialClassification["intent"];
    amount: number;
    description: string | null;
    category: string | null;
    necessityLevel: PersistableFinancialClassification["necessityLevel"];
    boxName: string | null;
    source: "telegram_agent";
  }): Promise<{ success: boolean; target: string; error?: string }> {
    if (!input.telegramUserId) {
      const error = "Missing Telegram user id for movement";

      console.error("[RODS][Supabase] Missing Telegram user id for movement");

      return { success: false, target: "Supabase", error };
    }

    const supabaseResult = await this.supabaseMovementService.createMovement({
      telegramUserId: input.telegramUserId,
      intent: input.intent,
      amount: input.amount,
      description: input.description,
      category: input.category,
      necessityLevel: input.necessityLevel,
      boxName: input.boxName,
      source: input.source,
    });

    if (supabaseResult.success) {
      return { success: true, target: "Supabase" };
    }

    const error = supabaseResult.error ?? "Unknown Supabase error";

    console.error("[RODS][Supabase] Failed to persist movement", { error });

    return {
      success: false,
      target: "Supabase",
      error,
    };
  }

  private formatClassificationPreview(
    classification: FinancialTextClassification,
    persistenceSaved: boolean,
    persistenceTarget: string,
  ): string {
    return [
      "Classificação prévia do RODS:",
      `Tipo: ${this.formatIntent(classification.intent)}`,
      `Valor: ${this.formatAmount(classification.amount)}`,
      `Descrição: ${classification.description ?? "não informada"}`,
      `Categoria: ${classification.category ?? "não informada"}`,
      `Nível: ${this.formatNecessityLevel(classification.necessityLevel)}`,
      persistenceSaved
        ? `Status: registrado no ${persistenceTarget}.`
        : `Status: classificação feita, mas o registro no ${persistenceTarget} não foi concluído.`,
    ].join("\n");
  }

  private formatPersistenceFailure(
    classification: PersistableFinancialClassification,
  ): string {
    return [
      "Classifiquei a movimentação, mas não consegui registrar no Supabase.",
      "Não vou marcar como salva para não bagunçar seu dashboard.",
      "",
      `Tipo: ${this.formatIntent(classification.intent)}`,
      `Valor: ${this.formatAmount(classification.amount)}`,
      `Categoria: ${classification.category ?? "não informada"}`,
      "",
      "Tente novamente em alguns instantes. Se persistir, confira a configuração do usuário, categoria, método de pagamento ou caixinha no Supabase.",
    ].join("\n");
  }

  private formatFinalResponse(
    classification: PersistableFinancialClassification,
    persistenceSaved: boolean,
    persistenceTarget: string,
    roast: string,
  ): string {
    return [
      persistenceSaved
        ? `Movimentação registrada no ${persistenceTarget}.`
        : `Movimentação classificada, mas o registro no ${persistenceTarget} não foi concluído.`,
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

  private formatNecessityLevel(
    necessityLevel: FinancialTextClassification["necessityLevel"],
  ): string {
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