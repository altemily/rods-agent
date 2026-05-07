import { OnboardingAgent } from "./onboardingAgent";

export class RodsAgent {
  constructor(private readonly onboardingAgent = new OnboardingAgent()) {}

  respond(chatId: string | number, message: string): string {
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

    return this.onboardingAgent.handleMessage(chatId, normalizedMessage);
  }
}
