import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  telegramChatId: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const onboardingSchema = z.object({
  userId: z.string(),
  chatId: z.union([z.string(), z.number()]),
  status: z.enum(["NOT_STARTED", "ONBOARDING_IN_PROGRESS", "ONBOARDING_COMPLETED"]),
  currentStep: z
    .enum([
      "monthlyIncome",
      "incomeFrequency",
      "fixedExpenses",
      "debts",
      "mainGoal",
      "goalAmount",
      "goalDeadline",
      "weeklyRoutine",
      "spendingTriggers",
      "riskCategories",
      "boxesAndInvestments",
      "roastLevel",
      "sensitiveLimits",
      "completed",
    ])
    .default("monthlyIncome"),
  answers: z.record(z.string(), z.string()).default({}),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export const financialMovementSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.enum(["expense", "income", "box_contribution"]),
  amount: z.number().positive(),
  currency: z.string().length(3).default("BRL"),
  description: z.string().min(1),
  category: z.string().optional(),
  occurredAt: z.string().datetime(),
});

export const agentResponseSchema = z.object({
  message: z.string().min(1),
  intent: z.enum(["onboarding", "register_expense", "register_income", "register_box_contribution", "unknown"]),
  confidence: z.number().min(0).max(1),
});

export type User = z.infer<typeof userSchema>;
export type Onboarding = z.infer<typeof onboardingSchema>;
export type OnboardingStatus = Onboarding["status"];
export type OnboardingStep = Onboarding["currentStep"];
export type FinancialMovement = z.infer<typeof financialMovementSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
