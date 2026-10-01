import { config as dotenvConfig } from "dotenv";
import { z } from "zod";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env before validation — no-op if the file doesn't exist
dotenvConfig();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // RS256 key paths
  JWT_PRIVATE_KEY_PATH: z.string().default("./keys/private.pem"),
  JWT_PUBLIC_KEY_PATH: z.string().default("./keys/public.pem"),

  // Token TTLs (in seconds)
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),   // 15 min
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),

  // CORS
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  // SMTP (optional in phase 1)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // AWS S3 (optional in phase 1)
  AWS_REGION: z.string().optional(),
  AWS_BUCKET_ATTACHMENTS: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // AI layer master switch. Off by default so the app runs unchanged without
  // the AI service. z.stringbool() is deliberate: z.coerce.boolean() would
  // turn the string "false" into true.
  AI_ENABLED: z.stringbool().default(false),

  // Internal Python AI service. Only reachable from this server, never from browsers.
  AI_SERVICE_URL: z.url().default("http://127.0.0.1:8000"),
  // Shared secret, must match the AI service's AI_SERVICE_TOKEN
  AI_SERVICE_TOKEN: z.string().min(32).optional(),
  // Per-request limit; slightly above the AI service's own LLM timeout (20s)
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
  // Background worker that processes queued AI jobs. Off on servers that
  // should only serve HTTP.
  AI_WORKER_ENABLED: z.stringbool().default(true),
  AI_WORKER_POLL_MS: z.coerce.number().int().positive().default(3_000),
  AI_JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
}).superRefine((env, ctx) => {
  if (env.AI_ENABLED && !env.AI_SERVICE_TOKEN) {
    ctx.addIssue({
      code: "custom",
      path: ["AI_SERVICE_TOKEN"],
      message: "AI_SERVICE_TOKEN is required when AI_ENABLED=true",
    });
  }
});

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌  Invalid environment variables:");
    parsed.error.issues.forEach((issue) => {
      console.error(`   ${issue.path.join(".")}: ${issue.message}`);
    });
    process.exit(1);
  }

  const env = parsed.data;

  let jwtPrivateKey: string;
  let jwtPublicKey: string;

  try {
    jwtPrivateKey = readFileSync(resolve(env.JWT_PRIVATE_KEY_PATH), "utf8");
    jwtPublicKey = readFileSync(resolve(env.JWT_PUBLIC_KEY_PATH), "utf8");
  } catch {
    console.error(
      "❌  RSA keys not found. Run: npx tsx scripts/generate-keys.ts"
    );
    process.exit(1);
  }

  return { ...env, jwtPrivateKey, jwtPublicKey };
}

export const env = loadEnv();
export type Env = typeof env;
