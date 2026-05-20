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
