import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  telegramChatId: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const onboardingSchema = z.object({
  userId: z.string(),
  step: z.enum(["profile", "income", "goals", "completed"]),
  isCompleted: z.boolean(),
  answers: z.record(z.string(), z.unknown()).default({}),
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
export type FinancialMovement = z.infer<typeof financialMovementSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
