import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";
import { env } from "../../src/config/env";

/**
 * Signs an access token for a user, with the same claims as
 * issueAccessToken() in auth.service.ts.
 *
 * Tests can't log in through the API for every request: /api/auth/login is
 * rate-limited to 5 attempts per 15 minutes. auth.test.ts checks that a token
 * from a real login and a token from this helper are treated the same way.
 */
export function tokenFor(user: Pick<User, "id" | "email" | "role" | "companyId">): string {
  return jwt.sign(
    {
      sub: user.id.toString(),
      email: user.email,
      role: user.role,
      companyId: user.companyId?.toString() ?? null,
    },
    env.jwtPrivateKey,
    { algorithm: "RS256", expiresIn: 300 }
  );
}

export function bearer(user: Pick<User, "id" | "email" | "role" | "companyId">) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}
