/**
 * Rebuilds and reconciles the similarity index.
 *
 *   npm run ai:reindex
 *
 * 1. Queues an index sync for every resolved or closed issue. The AI worker
 *    (in the running server) processes the queue.
 * 2. Removes index entries whose issue no longer exists (deleted issues
 *    can't be synced by a queued job, because their jobs are deleted with them).
 * 3. Queues a sync for indexed issues that are no longer resolved, so the
 *    worker removes them.
 *
 * Use after seeding, after restoring a database, or to repair drift.
 */
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { getDefaultAiClient } from "../src/features/ai/ai.client";
import { INDEXED_STATUSES, enqueueIndexSync } from "../src/features/ai/ai.jobs";

async function main(): Promise<void> {
  if (!env.AI_ENABLED) {
    console.error("AI_ENABLED is not true; nothing to index.");
    process.exitCode = 1;
    return;
  }
  const client = getDefaultAiClient();
  const requestId = `reindex-${Date.now()}`;

  const issues = await prisma.issue.findMany({
    select: { id: true, status: true, product: { select: { companyId: true } } },
  });
  const byId = new Map(issues.map((i) => [Number(i.id), i]));

  let queued = 0;
  for (const issue of issues.filter((i) => INDEXED_STATUSES.has(i.status))) {
    await prisma.$transaction((tx) =>
      enqueueIndexSync(tx, { issueId: issue.id, companyId: issue.product.companyId })
    );
    queued += 1;
  }

  let removedDeleted = 0;
  let queuedRemovals = 0;
  for (const doc of await client.listDocuments({ requestId })) {
    const issue = byId.get(doc.issueId);
    if (!issue) {
      await client.deleteDocument(doc.issueId, doc.companyId, { requestId });
      removedDeleted += 1;
    } else if (!INDEXED_STATUSES.has(issue.status)) {
      await prisma.$transaction((tx) =>
        enqueueIndexSync(tx, { issueId: issue.id, companyId: issue.product.companyId })
      );
      queuedRemovals += 1;
    }
  }

  console.log(`Queued ${queued} resolved issues for indexing.`);
  console.log(`Removed ${removedDeleted} entries for deleted issues.`);
  console.log(`Queued ${queuedRemovals} reopened issues for removal.`);
  console.log("The AI worker in the running server processes the queue.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
