export class GeminiService {
  constructor(
    private readonly apiKey = process.env.GEMINI_API_KEY,
    private readonly model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  ) {}

  async generateAgentResponse(_input: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    return `Gemini stub ready for ${this.model}`;
  }
}
