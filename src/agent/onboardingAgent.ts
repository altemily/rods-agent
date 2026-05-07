import type { CompletedOnboardingProfile, Onboarding, OnboardingStep } from "./schemas";

type ChatId = string | number;

type OnboardingQuestion = {
  step: Exclude<OnboardingStep, "completed">;
  label: string;
  question: string;
};

const OPENING_MESSAGE =
  "Antes de eu sair julgando seus gastos com confiança, preciso calibrar seu radar financeiro. Sem contexto, meu roast vira só piada genérica - e a gente não está aqui para isso.";

const QUESTIONS: OnboardingQuestion[] = [
  {
    step: "monthlyIncome",
    label: "renda mensal",
    question: "Qual é sua renda mensal aproximada? Pode responder em texto livre, sem planilha heroica agora.",
  },
  {
    step: "incomeFrequency",
    label: "frequência de recebimento",
    question: "Com que frequência você recebe? Mensal, quinzenal, semanal, variável?",
  },
  {
    step: "fixedExpenses",
    label: "despesas fixas",
    question: "Quais são suas principais despesas fixas? Aluguel, contas, assinaturas, transporte... pode listar do seu jeito.",
  },
  {
    step: "debts",
    label: "dívidas",
    question: "Você tem dívidas hoje? Se sim, quais? Se não tiver, pode mandar 'não tenho' e seguimos felizes por 4 segundos.",
  },
  {
    step: "mainGoal",
    label: "meta principal",
    question: "Qual é sua principal meta financeira agora?",
  },
  {
    step: "goalAmount",
    label: "valor da meta",
    question: "Qual é o valor aproximado dessa meta?",
  },
  {
    step: "goalDeadline",
    label: "prazo da meta",
    question: "Em quanto tempo você quer chegar nessa meta?",
  },
  {
    step: "weeklyRoutine",
    label: "rotina semanal",
    question: "Como é sua rotina semanal? Trabalho, estudos, deslocamento, rolês, delivery, tudo que mexe no bolso.",
  },
  {
    step: "spendingTriggers",
    label: "gatilhos de consumo",
    question: "Quais situações costumam disparar gastos? Cansaço, ansiedade, promoção, fome, tédio, social?",
  },
  {
    step: "riskCategories",
    label: "categorias de risco",
    question: "Quais categorias mais ameaçam seu orçamento? Ex: comida fora, apps, roupas, transporte, lazer, mercado.",
  },
  {
    step: "boxesAndInvestments",
    label: "caixinhas/investimentos",
    question: "Você já tem caixinhas, reserva ou investimentos? Pode dizer 'não tenho' sem drama contábil.",
  },
  {
    step: "roastLevel",
    label: "nível de roast",
    question: "Qual nível de roast você aceita do RODS? Leve, médio ou modo boleto vencido? Prometo calibrar sem violência gratuita.",
  },
  {
    step: "sensitiveLimits",
    label: "limites sensíveis",
    question: "Tem algum limite sensível que eu não devo cruzar? Ex: temas, palavras, situações pessoais. Pode responder 'pular'.",
  },
];

const onboardingStates = new Map<string, Onboarding>();

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

export class OnboardingAgent {
  isCompleted(chatId: ChatId): boolean {
    return onboardingStates.get(normalizeChatId(chatId))?.status === "ONBOARDING_COMPLETED";
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

    return `Você já está em calibração. Nada de reiniciar no susto.\n\n${formatCurrentQuestion(existingState)}`;
  }

  reset(chatId: ChatId): string {
    const state = createInitialState(chatId);
    onboardingStates.set(normalizeChatId(chatId), state);

    return `Calibração reiniciada.\n\n${OPENING_MESSAGE}\n\n${formatCurrentQuestion(state)}`;
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

    return `Registrado. Sem julgamento ainda - só calibragem.\n\n${formatCurrentQuestion(state)}`;
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
      `- Meta principal: ${answerFor(state, "mainGoal")}`,
      `- Valor da meta: ${answerFor(state, "goalAmount")}`,
      `- Prazo da meta: ${answerFor(state, "goalDeadline")}`,
      `- Rotina semanal: ${answerFor(state, "weeklyRoutine")}`,
      `- Gatilhos de consumo: ${answerFor(state, "spendingTriggers")}`,
      `- Categorias de risco: ${answerFor(state, "riskCategories")}`,
      `- Caixinhas/investimentos: ${answerFor(state, "boxesAndInvestments")}`,
      `- Nível de roast: ${answerFor(state, "roastLevel")}`,
      `- Limites sensíveis: ${answerFor(state, "sensitiveLimits")}`,
      "",
      "Agora mande uma movimentação financeira para eu classificar, registrar no Notion e comentar com contexto.",
    ].join("\n");
  }
}
