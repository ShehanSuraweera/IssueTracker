import { prisma } from "../../src/lib/prisma";

/**
 * Empties every application table. The table list is read from the database,
 * so tables added by future migrations are cleared automatically.
 *
 * Runs inside one transaction because FOREIGN_KEY_CHECKS is a per-connection
 * setting and Prisma uses a connection pool. DELETE is used instead of
 * TRUNCATE because TRUNCATE implicitly commits in MySQL.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ name: string }[]>`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
  `;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
    for (const { name } of tables) {
      await tx.$executeRawUnsafe(`DELETE FROM \`${name}\``);
    }
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
  });
}
