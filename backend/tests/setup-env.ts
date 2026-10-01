/**
 * Runs in each test file before the file's own imports. env.ts reads
 * process.env once at import time, so test values must be in place first.
 * dotenv never overrides variables that are already set, so these values win
 * over anything in a developer's local .env.
 */
import { afterAll, inject } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = inject("databaseUrl");
process.env.JWT_PRIVATE_KEY_PATH = inject("jwtPrivateKeyPath");
process.env.JWT_PUBLIC_KEY_PATH = inject("jwtPublicKeyPath");
process.env.AI_ENABLED = "false";

afterAll(async () => {
  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();
});
