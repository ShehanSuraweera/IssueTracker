/**
 * Generates an RSA-2048 key pair for JWT RS256 signing.
 * Writes private.pem and public.pem to the /keys directory.
 * Run once: npx tsx scripts/generate-keys.ts
 */
import { generateKeyPairSync } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const keysDir = join(__dirname, "..", "keys");

mkdirSync(keysDir, { recursive: true });

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

writeFileSync(join(keysDir, "private.pem"), privateKey);
writeFileSync(join(keysDir, "public.pem"), publicKey);

console.log("✓ RSA-2048 key pair generated:");
console.log("  keys/private.pem  (keep secret, never commit)");
console.log("  keys/public.pem   (safe to distribute)");
console.log("\nAdd these to your .env:");
console.log(
  `JWT_PRIVATE_KEY_PATH=./keys/private.pem\nJWT_PUBLIC_KEY_PATH=./keys/public.pem`
);
