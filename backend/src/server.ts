import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

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
}

bootstrap().catch((err) => {
  console.error("❌  Bootstrap failed:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received — shutting down gracefully");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
