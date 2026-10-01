import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { getDefaultAiClient } from "./features/ai/ai.client";
import { startAiWorker, type RunningWorker } from "./features/ai/ai.worker";

let aiWorker: RunningWorker | undefined;

async function bootstrap() {
  // Verify DB connectivity before accepting traffic
  await prisma.$connect();
  console.log("✓ Database connected");

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`✓ Server running on http://localhost:${env.PORT}`);
    console.log(`✓ API docs:    http://localhost:${env.PORT}/api-docs`);
    console.log(`✓ OpenAPI JSON: http://localhost:${env.PORT}/api-docs.json`);
    console.log(`  Environment: ${env.NODE_ENV}`);
  });

  if (env.AI_ENABLED && env.AI_WORKER_ENABLED) {
    aiWorker = startAiWorker({ client: getDefaultAiClient(), pollMs: env.AI_WORKER_POLL_MS });
    console.log("✓ AI worker started");
  }
}

bootstrap().catch((err) => {
  console.error("❌  Bootstrap failed:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received — shutting down gracefully");
  await aiWorker?.stop();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await aiWorker?.stop();
  await prisma.$disconnect();
  process.exit(0);
});
