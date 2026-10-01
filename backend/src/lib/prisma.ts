import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const adapter = new PrismaPg({ connectionString: url });

  return new PrismaClient({
    adapter,
    log:
      process.env.DATABASE_DEBUG === "true"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });
}

// Reuse the client across hot-reloads in development
export const prisma = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
