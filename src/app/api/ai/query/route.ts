import { NextRequest, NextResponse } from "next/server";
import { aiQuerySchema } from "@/lib/validation/schemas";
import { getHealthCopilotProvider } from "@/lib/ai/provider";

// Receives already-sanitized text from the client only. Never logs request
// bodies containing medical text.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = aiQuerySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const provider = getHealthCopilotProvider();
  const result = await provider.answer({
    question: parsed.data.question,
    sanitizedContext: parsed.data.sanitizedContext,
  });

  return NextResponse.json(result);
}
