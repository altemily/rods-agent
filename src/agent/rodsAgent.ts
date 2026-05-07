import type { AgentResponse } from "./schemas";

export class RodsAgent {
  async respond(_message: string): Promise<AgentResponse> {
    return {
      message: "RODS online. Agora vamos calibrar seu radar financeiro.",
      intent: "unknown",
      confidence: 0,
    };
  }
}
