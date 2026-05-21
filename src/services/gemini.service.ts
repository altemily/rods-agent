type GeminiServiceDiagnostics = {
  model: string;
  hasApiKey: boolean;
};

function serializeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

export class GeminiService {
  constructor(
    private readonly apiKey = process.env.GEMINI_API_KEY,
    private readonly model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  ) {}

  getDiagnostics(): GeminiServiceDiagnostics {
    return {
      model: this.model,
      hasApiKey: Boolean(this.apiKey),
    };
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generateText(prompt: string): Promise<string> {
    console.info("[RODS][Gemini]", {
      stage: "gemini-service",
      ...this.getDiagnostics(),
    });

    if (!this.apiKey) {
      console.error("[RODS][Gemini]", {
        stage: "gemini-service",
        ...this.getDiagnostics(),
        error: {
          name: "ConfigurationError",
          message: "GEMINI_API_KEY is not configured",
        },
      });

      throw new Error("GEMINI_API_KEY is not configured");
    }

    let response: Response;

    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        },
      );
    } catch (error) {
      console.error("[RODS][Gemini]", {
        stage: "gemini-service",
        ...this.getDiagnostics(),
        error: serializeError(error),
      });

      throw error;
    }

    if (!response.ok) {
      console.error("[RODS][Gemini]", {
        stage: "gemini-service",
        ...this.getDiagnostics(),
        status: response.status,
        error: {
          name: "GeminiHttpError",
          message: "Gemini request failed",
        },
      });

      throw new Error("Gemini request failed");
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };

    return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
}
