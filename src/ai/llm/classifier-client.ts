/**
 * Claude client seam for classification calls.
 *
 * The Supervisor needs a small, cheap, NON-streaming completion that returns JSON. We
 * expose a minimal interface so the supervisor/routing logic is unit-testable WITHOUT a
 * live API key (inject a fake), and so the real Anthropic SDK is wired in one place when
 * keys are available.
 *
 * This is intentionally separate from the (future) streaming generation client used to
 * actually answer the user (Phase 2 Chat Engine) — classification is a different,
 * bounded call.
 */

export interface ClassifyRequest {
  system: string;
  user: string;
  /** Hard cap; classification output is tiny JSON. */
  maxTokens?: number;
  /** Low temperature for stable classification. */
  temperature?: number;
  /** Abort/timeout signal from the orchestrator. */
  signal?: AbortSignal;
}

export interface ClassifyResult {
  /** Raw model text (expected to be a single JSON object). */
  text: string;
}

/** The seam the Supervisor depends on. Implementations: Anthropic, or a fake in tests. */
export interface ClassifierClient {
  classify(req: ClassifyRequest): Promise<ClassifyResult>;
}

/**
 * Real Anthropic-backed classifier. Lazily imports the SDK so the module graph (and
 * tests) don't require it until a real classification is actually made. Reads model id
 * and key from env (ARCHITECTURE §12); a smaller/faster Claude model is appropriate for
 * classification.
 */
export function createAnthropicClassifier(opts?: {
  apiKey?: string;
  model?: string;
}): ClassifierClient {
  const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const model = opts?.model ?? process.env.ANTHROPIC_CLASSIFIER_MODEL ?? "claude-haiku-4-5-20251001";

  return {
    async classify(req: ClassifyRequest): Promise<ClassifyResult> {
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY missing — cannot run supervisor classification");
      }
      // Lazy import keeps the dependency optional until first real use.
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey });
      const res = await client.messages.create(
        {
          model,
          max_tokens: req.maxTokens ?? 128,
          temperature: req.temperature ?? 0,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
        },
        { signal: req.signal },
      );
      const text = res.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      return { text };
    },
  };
}
