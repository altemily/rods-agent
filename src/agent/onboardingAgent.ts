import type {
  CompletedOnboardingProfile,
  Onboarding,
  OnboardingStep,
} from "./schemas";

type ChatId = string | number;

type OnboardingQuestion = {
  step: Exclude<OnboardingStep, "completed">;
  label: string;
  question: string;
};

const OPENING_MESSAGE =
  "Antes de começar a julgar seus gastos com confiança, preciso calibrar seu radar financeiro. Sem contexto, minha análise vira achismo financeiro — e aqui a humilhação é personalizada.";

const QUESTIONS: OnboardingQuestion[] = [
  {
    step: "monthlyIncome",
    label: "renda mensal",
    question:
      "Qual é sua renda mensal aproximada? Pode responder em texto livre, sem planilha heróica agora.",
  },
  {
    step: "incomeFrequency",
    label: "frequência de recebimento",
    question:
      "Com que frequência você recebe? Mensal, quinzenal, semanal, variável?",
  },
  {
    step: "fixedExpenses",
    label: "despesas fixas",
    question:
      "Quais são suas principais despesas fixas? Aluguel, contas, assinaturas, transporte... pode listar do seu jeito.",
  },
  {
    step: "debts",
    label: "dívidas",
    question:
      "Você tem dívidas hoje? Se sim, quais? Se não tiver, pode mandar 'não tenho' e seguimos felizes por 4 segundos.",
  },
  {
    step: "mainGoal",
    label: "metas financeiras",
    question:
      "Quais metas financeiras você quer acompanhar? Pode mandar uma ou várias, uma por linha ou separadas por vírgula. Ex: reserva de emergência, viagem, carro novo .",
  },
  {
    step: "goalAmount",
    label: "valores das metas",
    question:
      "Qual é o valor aproximado de cada meta? Pode responder do seu jeito. Ex: reserva R$ 10.000, viagem R$ 5.000, carro novo: 80.000.",
  },
  {
    step: "goalDeadline",
    label: "prazos das metas",
    question:
      "Qual é o prazo de cada meta? Ex: reserva em 12 meses, viagem em 2027.",
  },
  {
    step: "weeklyRoutine",
    label: "rotina semanal",
    question:
      "Como sua rotina da semana costuma impactar seus gastos? Ex: trabalho presencial, estudos, transporte, mercado, delivery, saídas, filhos, pets ou qualquer hábito que mexa no bolso.",
  },
  {
    step: "spendingTriggers",
    label: "gatilhos de consumo",
    question:
      "Quais situações costumam disparar gastos? Cansaço, ansiedade, promoção, fome, tédio, social?",
  },
  {
    step: "riskCategories",
    label: "categorias de risco",
    question:
      "Quais categorias mais ameaçam seu orçamento? Ex: comida fora, apps, roupas, transporte, lazer, mercado.",
  },
  {
    step: "boxesAndInvestments",
    label: "cofrinhos, caixinhas e investimentos",
    question:
      "Quais cofrinhos, caixinhas, reservas ou investimentos você já tem hoje? Ex: emergência, viagem, filhos, investimentos, conta parada. Pode dizer o nome e o valor aproximado se quiser.",
  },
  {
    step: "roastLevel",
    label: "tom da cobrança",
    question:
      "Qual tom de cobrança você aceita do RODS? Modo Passo Pano, Modo Fatura Chegando ou Modo Boleto Vencido? Prometo calibrar sem violência gratuita.",
  },
  {
    step: "sensitiveLimits",
    label: "limites sensíveis",
    question:
      "Tem algum limite sensível que eu não devo cruzar? Ex: temas, palavras, situações pessoais. Pode responder 'pular'.",
  },
];

const onboardingStates = new Map<string, Onboarding>();

const DEV_SEED_ANSWERS: Onboarding["answers"] = {
  monthlyIncome: "5000",
  incomeFrequency: "mensal",
  fixedExpenses: "aluguel, internet, energia, mercado",
  debts: "não tenho",
  mainGoal: "reserva de emergência, setup novo, viagem e CNH",
  goalAmount:
    "reserva: R$ 10.000; setup: R$ 8.000; viagem: R$ 5.000; CNH: R$ 3.000",
  goalDeadline:
    "reserva: 12 meses; setup: dezembro de 2026; viagem: 2027; CNH: até o final de 2026",
  weeklyRoutine: "trabalho, estudo e rotina corrida",
  spendingTriggers: "delivery e compras por cansaço",
  riskCategories: "comida fora, tecnologia e compras por impulso",
  boxesAndInvestments:
    "emergência: R$ 500; setup: R$ 200; viagem: R$ 0; investimentos: ainda não tenho",
  roastLevel: "controlado",
  sensitiveLimits: "não usar saúde, família ou aparência",
};

function normalizeChatId(chatId: ChatId): string {
  return String(chatId);
}

function nowIso(): string {
  return new Date().toISOString();
}

function getQuestion(step: OnboardingStep): OnboardingQuestion | undefined {
  return QUESTIONS.find((question) => question.step === step);
}

function getNextStep(step: OnboardingStep): OnboardingStep {
  const currentIndex = QUESTIONS.findIndex((question) => question.step === step);
  const nextQuestion = QUESTIONS[currentIndex + 1];

  return nextQuestion?.step ?? "completed";
}

function formatCurrentQuestion(state: Onboarding): string {
  const question = getQuestion(state.currentStep);

  if (!question) {
    return "Sua calibração já foi concluída. Se quiser refazer, use /reset.";
  }

  return `Etapa atual: ${question.label}.\n\n${question.question}`;
}

function createInitialState(chatId: ChatId): Onboarding {
  return {
    userId: normalizeChatId(chatId),
    chatId,
    status: "ONBOARDING_IN_PROGRESS",
    currentStep: "monthlyIncome",
    answers: {},
    startedAt: nowIso(),
  };
}

function answerFor(state: Onboarding, step: OnboardingQuestion["step"]): string {
  return state.answers[step] ?? "não informado";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringFromProfile(
  profile: Record<string, unknown>,
  key: keyof CompletedOnboardingProfile,
): string {
  const value = profile[key];

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return "não informado";
}

export class OnboardingAgent {
  isCompleted(chatId: ChatId): boolean {
    return (
      onboardingStates.get(normalizeChatId(chatId))?.status ===
      "ONBOARDING_COMPLETED"
    );
  }

  restoreCompletedProfile(chatId: ChatId, profile: unknown): boolean {
    if (!isRecord(profile)) {
      return false;
    }

    const completedAt =
      typeof profile.completedAt === "string" && profile.completedAt.trim()
        ? profile.completedAt
        : nowIso();

    const state: Onboarding = {
      userId: normalizeChatId(chatId),
      chatId,
      status: "ONBOARDING_COMPLETED",
      currentStep: "completed",
      answers: {
        monthlyIncome: getStringFromProfile(profile, "monthlyIncome"),
        incomeFrequency: getStringFromProfile(profile, "incomeFrequency"),
        fixedExpenses: getStringFromProfile(profile, "fixedExpenses"),
        debts: getStringFromProfile(profile, "debts"),
        mainGoal: getStringFromProfile(profile, "mainGoal"),
        goalAmount: getStringFromProfile(profile, "goalAmount"),
        goalDeadline: getStringFromProfile(profile, "goalDeadline"),
        weeklyRoutine: getStringFromProfile(profile, "weeklyRoutine"),
        spendingTriggers: getStringFromProfile(profile, "spendingTriggers"),
        riskCategories: getStringFromProfile(profile, "riskCategories"),
        boxesAndInvestments: getStringFromProfile(
          profile,
          "boxesAndInvestments",
        ),
        roastLevel: getStringFromProfile(profile, "roastLevel"),
        sensitiveLimits: getStringFromProfile(profile, "sensitiveLimits"),
      },
      startedAt: completedAt,
      completedAt,
    };

    onboardingStates.set(normalizeChatId(chatId), state);

    return true;
  }

  getCompletedProfile(chatId: ChatId): CompletedOnboardingProfile | null {
    const state = onboardingStates.get(normalizeChatId(chatId));

    if (!state || state.status !== "ONBOARDING_COMPLETED") {
      return null;
    }

    return {
      userId: state.userId,
      chatId: state.chatId,
      monthlyIncome: answerFor(state, "monthlyIncome"),
      incomeFrequency: answerFor(state, "incomeFrequency"),
      fixedExpenses: answerFor(state, "fixedExpenses"),
      debts: answerFor(state, "debts"),
      mainGoal: answerFor(state, "mainGoal"),
      goalAmount: answerFor(state, "goalAmount"),
      goalDeadline: answerFor(state, "goalDeadline"),
      weeklyRoutine: answerFor(state, "weeklyRoutine"),
      spendingTriggers: answerFor(state, "spendingTriggers"),
      riskCategories: answerFor(state, "riskCategories"),
      boxesAndInvestments: answerFor(state, "boxesAndInvestments"),
      roastLevel: answerFor(state, "roastLevel"),
      sensitiveLimits: answerFor(state, "sensitiveLimits"),
      completedAt: state.completedAt,
    };
  }

  start(chatId: ChatId): string {
    const existingState = onboardingStates.get(normalizeChatId(chatId));

    if (!existingState) {
      const state = createInitialState(chatId);
      onboardingStates.set(normalizeChatId(chatId), state);

      return `${OPENING_MESSAGE}\n\n${formatCurrentQuestion(state)}`;
    }

    if (existingState.status === "ONBOARDING_COMPLETED") {
      return "Sua calibração já foi concluída. Se quiser refazer a entrevista do zero, use /reset.";
    }

    return `Você já está em calibração. Nada de reiniciar no susto.\n\n${formatCurrentQuestion(
      existingState,
    )}`;
  }

  reset(chatId: ChatId): string {
    const state = createInitialState(chatId);
    onboardingStates.set(normalizeChatId(chatId), state);

    return `Calibração reiniciada.\n\n${OPENING_MESSAGE}\n\n${formatCurrentQuestion(
      state,
    )}`;
  }

  seedCompletedProfile(chatId: ChatId): string {
    const timestamp = nowIso();

    const state: Onboarding = {
      userId: normalizeChatId(chatId),
      chatId,
      status: "ONBOARDING_COMPLETED",
      currentStep: "completed",
      answers: { ...DEV_SEED_ANSWERS },
      startedAt: timestamp,
      completedAt: timestamp,
    };

    onboardingStates.set(normalizeChatId(chatId), state);

    return "Perfil de teste carregado. Onboarding marcado como concluído. Agora você pode testar movimentações.";
  }

  getStatus(chatId: ChatId): string {
    const state = onboardingStates.get(normalizeChatId(chatId));

    if (!state) {
      return "Status: NOT_STARTED. Envie /start para começar a calibrar seu radar financeiro.";
    }

    if (state.status === "ONBOARDING_COMPLETED") {
      return "Status: ONBOARDING_COMPLETED. Sua calibração inicial já foi concluída. Use /reset se quiser refazer.";
    }

    return `Status: ONBOARDING_IN_PROGRESS.\n\n${formatCurrentQuestion(state)}`;
  }

  handleMessage(chatId: ChatId, text: string): string {
    const state = onboardingStates.get(normalizeChatId(chatId));

    if (!state) {
      return "Antes de eu opinar sobre seus gastos, preciso de contexto. Envie /start para começar a calibração.";
    }

    if (state.status === "ONBOARDING_COMPLETED") {
      return "Sua calibração inicial já está concluída. Agora mande uma movimentação financeira para eu classificar, registrar e comentar com contexto.";
    }

    const currentQuestion = getQuestion(state.currentStep);

    if (!currentQuestion) {
      state.status = "ONBOARDING_COMPLETED";
      state.currentStep = "completed";
      state.completedAt = nowIso();

      return this.buildSummary(state);
    }

    state.answers[currentQuestion.step] = text.trim() || "sem texto";
    state.currentStep = getNextStep(currentQuestion.step);

    if (state.currentStep === "completed") {
      state.status = "ONBOARDING_COMPLETED";
      state.completedAt = nowIso();

      return this.buildSummary(state);
    }

    return `Registrado. Sem julgamento ainda — só calibragem.\n\n${formatCurrentQuestion(
      state,
    )}`;
  }

  private buildSummary(state: Onboarding): string {
    return [
      "Calibração concluída. Status: ONBOARDING_COMPLETED.",
      "",
      "Resumo financeiro e comportamental inicial:",
      `- Renda mensal: ${answerFor(state, "monthlyIncome")}`,
      `- Frequência de recebimento: ${answerFor(state, "incomeFrequency")}`,
      `- Despesas fixas: ${answerFor(state, "fixedExpenses")}`,
      `- Dívidas: ${answerFor(state, "debts")}`,
      `- Metas financeiras: ${answerFor(state, "mainGoal")}`,
      `- Valores das metas: ${answerFor(state, "goalAmount")}`,
      `- Prazos das metas: ${answerFor(state, "goalDeadline")}`,
      `- Rotina semanal: ${answerFor(state, "weeklyRoutine")}`,
      `- Gatilhos de consumo: ${answerFor(state, "spendingTriggers")}`,
      `- Categorias de risco: ${answerFor(state, "riskCategories")}`,
      `- Cofrinhos, caixinhas e investimentos: ${answerFor(
        state,
        "boxesAndInvestments",
      )}`,
      `- Tom da cobrança: ${answerFor(state, "roastLevel")}`,
      `- Limites sensíveis: ${answerFor(state, "sensitiveLimits")}`,
      "",
      "Agora mande uma movimentação financeira para eu classificar, registrar no Supabase e comentar com contexto.",
    ].join("\n");
  }
}
