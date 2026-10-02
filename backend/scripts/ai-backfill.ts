/**
 * Queues AI triage and sentiment for issues and client comments that were
 * saved without it, such as seeded data.
 *
 *   npm run ai:backfill                       # one job every 5 s
 *   npm run ai:backfill -- --interval-ms 2000
 *   npm run ai:backfill -- --dry-run          # count only, queue nothing
 *
 * The AI worker in the running server processes the queue. Each job is one
 * LLM call; the default spacing keeps under 15 requests a minute, which fits
 * the Gemini free tier.
 */
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { queueBackfill } from "../src/features/ai/ai.backfill";

const DEFAULT_INTERVAL_MS = 5000;

function parseArgs(argv: string[]): { intervalMs: number; dryRun: boolean } {
  const dryRun = argv.includes("--dry-run");
  const flag = argv.indexOf("--interval-ms");
  const intervalMs = flag === -1 ? DEFAULT_INTERVAL_MS : Number(argv[flag + 1]);
  if (!Number.isInteger(intervalMs) || intervalMs < 0) {
    throw new Error("--interval-ms must be a whole number of milliseconds");
  }
  return { intervalMs, dryRun };
}

async function main(): Promise<void> {
  if (!env.AI_ENABLED) {
    console.error("AI_ENABLED is not true; nothing to backfill.");
    process.exitCode = 1;
    return;
  }
  const { intervalMs, dryRun } = parseArgs(process.argv.slice(2));
  const result = await queueBackfill({ intervalMs, dryRun });

  const verb = dryRun ? "Would queue" : "Queued";
  console.log(`${verb} analysis for ${result.issues} issues and sentiment for ${result.comments} client comments.`);
  if (!dryRun && result.lastDueAt) {
    console.log(`The last job is due at ${result.lastDueAt.toLocaleTimeString()}. The AI worker in the running server processes them.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
