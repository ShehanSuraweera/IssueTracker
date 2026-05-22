import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { AppError } from "../../middleware/errorHandler";
import type { RegisterInput, LoginInput, RequestAccessInput } from "./auth.schemas";
import type { UserRole } from "@prisma/client";

const BCRYPT_ROUNDS = 10;

// ─── Token Helpers ───────────────────────────────────────────────────────────

function issueAccessToken(payload: {
  id: bigint;
  email: string;
  role: UserRole;
  companyId: bigint | null;
}): string {
  return jwt.sign(
    {
      sub: payload.id.toString(),
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId?.toString() ?? null,
    },
    env.jwtPrivateKey,
    {
      algorithm: "RS256",
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    }
  );
}

async function issueRefreshToken(
  userId: bigint,
  meta: { ipAddress?: string; userAgent?: string }
): Promise<string> {
  const rawToken = crypto.randomBytes(64).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_TTL_DAYS);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });

  return rawToken;
}

function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ─── Serialized User (safe to return in responses) ───────────────────────────

function serializeUser(user: {
  id: bigint;
  email: string;
  fullName: string;
  role: UserRole;
  companyId: bigint | null;
  office: string | null;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id.toString(),
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    companyId: user.companyId?.toString() ?? null,
    office: user.office,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

// ─── Service Methods ─────────────────────────────────────────────────────────

export async function register(
  input: RegisterInput,
  meta: { ipAddress?: string; userAgent?: string }
) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (existing) {
    throw new AppError(409, "EMAIL_TAKEN", "This email address is already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash,
      fullName: input.fullName,
      role: "client_user",
    },
  });

  const accessToken = issueAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id, meta);

  return {
    accessToken,
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    user: serializeUser(user),
  };
}

export async function login(
  input: LoginInput,
  meta: { ipAddress?: string; userAgent?: string }
) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  // Constant-time comparison — don't reveal whether the email exists
  if (!user) {
    await bcrypt.hash("dummy-prevent-timing-attack", BCRYPT_ROUNDS);
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const passwordMatch = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatch) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  // Only reveal pending status after correct password — prevents email enumeration
  if (!user.isActive) {
    throw new AppError(403, "ACCOUNT_PENDING", "Your account is pending admin approval. You will be notified once access is granted.");
  }

  const accessToken = issueAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id, meta);

  return {
    accessToken,
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    user: serializeUser(user),
  };
}

export async function requestAccess(input: RequestAccessInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (existing) {
    throw new AppError(409, "EMAIL_TAKEN", "This email address is already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  // Find existing company by name (case-insensitive) or create a new one
  let company = await prisma.company.findFirst({
    where: { name: input.companyName },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name:         input.companyName,
        contactEmail: input.email.toLowerCase(),
        region:       "GLOBAL",
      },
    });
  }

  await prisma.user.create({
    data: {
      email:        input.email.toLowerCase(),
      passwordHash,
      fullName:     input.fullName,
      role:         "client_user",
      companyId:    company.id,
      isActive:     false,
    },
  });

  return { message: "Access request submitted. An admin will review your request and notify you." };
}

export async function refresh(
  rawToken: string,
  meta: { ipAddress?: string; userAgent?: string }
) {
  const tokenHash = hashRefreshToken(rawToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored || !stored.isValid || stored.expiresAt < new Date()) {
    throw new AppError(401, "REFRESH_TOKEN_INVALID", "Refresh token is invalid or expired");
  }

  if (!stored.user.isActive) {
    throw new AppError(401, "ACCOUNT_DISABLED", "Account is disabled");
  }

  // Rotate: invalidate consumed token, issue new pair
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { isValid: false },
  });

  const accessToken = issueAccessToken(stored.user);
  const newRefreshToken = await issueRefreshToken(stored.userId, meta);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    user: serializeUser(stored.user),
  };
}

export async function logout(userId: bigint, rawToken?: string) {
  if (rawToken) {
    const tokenHash = hashRefreshToken(rawToken);
    await prisma.refreshToken.updateMany({
      where: { userId, tokenHash, isValid: true },
      data: { isValid: false },
    });
  } else {
    // Invalidate all refresh tokens for this user (sign out everywhere)
    await prisma.refreshToken.updateMany({
      where: { userId, isValid: true },
      data: { isValid: false },
    });
  }
}

export async function getMe(userId: bigint) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      company: { select: { id: true, name: true, region: true } },
    },
  });

  if (!user || !user.isActive) {
    throw new AppError(401, "UNAUTHORIZED", "User not found or inactive");
  }

  return {
    ...serializeUser(user),
    company: user.company
      ? {
          id: user.company.id.toString(),
          name: user.company.name,
          region: user.company.region,
        }
      : null,
  };
}
