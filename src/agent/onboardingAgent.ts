import type { Onboarding } from "./schemas";

export class OnboardingAgent {
  getInitialState(userId: string): Onboarding {
    return {
      userId,
      step: "profile",
      isCompleted: false,
      answers: {},
    };
  }
}
