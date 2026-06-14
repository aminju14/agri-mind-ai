/**
 * Usage / cost accounting repository (docs/DATABASE.md §4, MASTER §12.5).
 * One row per provider call; written at the orchestrator finalize step.
 * User-owned (tenant-scoped) so per-user spend can be metered.
 */
import { withTenant } from "./tenant";

export interface RecordUsageInput {
  messageId?: string | null;
  provider: "anthropic" | "openai" | "brave";
  kind: "generation" | "embedding" | "search" | "insight";
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
}

export async function recordUsage(userId: string, input: RecordUsageInput): Promise<void> {
  await withTenant(userId, async (tx) => {
    await tx.usageEvent.create({
      data: {
        userId,
        messageId: input.messageId ?? null,
        provider: input.provider,
        kind: input.kind,
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        costUsd: input.costUsd ?? 0,
        latencyMs: input.latencyMs ?? 0,
      },
    });
  });
}

/** Sum a user's spend since a timestamp (cost-runaway guard — MASTER §15). */
export async function userSpendSince(userId: string, since: Date): Promise<number> {
  return withTenant(userId, async (tx) => {
    const agg = await tx.usageEvent.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { costUsd: true },
    });
    return Number(agg._sum.costUsd ?? 0);
  });
}
