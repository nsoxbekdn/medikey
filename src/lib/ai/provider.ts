import "server-only";

export interface HealthCopilotProvider {
  answer(input: {
    question: string;
    sanitizedContext: Array<{ sourceId: string; text: string }>;
  }): Promise<{ answer: string; sourceIds: string[] }>;
}

// Clearly labeled mock — used when AI_API_KEY is unset so the MVP flow still
// runs end-to-end without a live provider.
export class MockHealthCopilotProvider implements HealthCopilotProvider {
  async answer(input: { question: string; sanitizedContext: Array<{ sourceId: string; text: string }> }) {
    const sourceIds = input.sanitizedContext.map((c) => c.sourceId);
    return {
      answer:
        `[Demo AI — informational only, not medical advice] Based on the ${input.sanitizedContext.length} ` +
        `sanitized record(s) you shared, here is a general explanation related to: "${input.question}". ` +
        `This is a mocked response because no AI provider is configured.`,
      sourceIds,
    };
  }
}

export function getHealthCopilotProvider(): HealthCopilotProvider {
  if (!process.env.AI_API_KEY) return new MockHealthCopilotProvider();
  // Real provider adapters (OpenAI/Gemini/etc.) plug in here, server-side only.
  return new MockHealthCopilotProvider();
}
