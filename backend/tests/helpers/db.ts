import { prisma } from "../../src/lib/prisma";

/**
 * Empties every application table and resets ID sequences. The table list is
 * read from the database, so tables added by future migrations are cleared
 * automatically.
 *
 * One TRUNCATE statement covers all tables: CASCADE handles foreign keys and
 * RESTART IDENTITY resets the auto-increment sequences.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ name: string }[]>`
    SELECT tablename AS name
    FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;

  const list = tables.map(({ name }) => `"${name}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
