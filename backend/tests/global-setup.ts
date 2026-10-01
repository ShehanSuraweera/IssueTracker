/**
 * Runs once before the whole suite:
 *  1. Starts a disposable Postgres container (or uses TEST_DATABASE_URL if set)
 *  2. Applies the real Prisma migrations to it
 *  3. Generates a throwaway RSA key pair for signing test JWTs
 *
 * Nothing here touches the developer's own database or keys.
 */
import { execSync } from "child_process";
import { generateKeyPairSync, randomUUID } from "crypto";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
    jwtPrivateKeyPath: string;
    jwtPublicKeyPath: string;
  }
}

export default async function setup(project: TestProject) {
  let container: StartedPostgreSqlContainer | undefined;
  let databaseUrl = process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    // pgvector/pgvector is the official Postgres image plus the pgvector
    // extension, which the AI features need from Phase 5 onward
    container = await new PostgreSqlContainer("pgvector/pgvector:pg17")
      .withDatabase("newnopdesk_test")
      .withUsername("test")
      .withPassword("test")
      .start();
    databaseUrl = container.getConnectionUri();
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const keysDir = join(tmpdir(), `newnopdesk-test-keys-${randomUUID()}`);
  mkdirSync(keysDir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeFileSync(join(keysDir, "private.pem"), privateKey);
  writeFileSync(join(keysDir, "public.pem"), publicKey);

  project.provide("databaseUrl", databaseUrl);
  project.provide("jwtPrivateKeyPath", join(keysDir, "private.pem"));
  project.provide("jwtPublicKeyPath", join(keysDir, "public.pem"));

  return async () => {
    rmSync(keysDir, { recursive: true, force: true });
    await container?.stop();
  };
}
