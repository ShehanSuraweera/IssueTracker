import bcrypt from "bcrypt";
import { UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import type {
  CreateUserInput,
  UpdateUserInput,
  ChangePasswordInput,
  GrantProductAccessInput,
} from "./users.schemas";

interface AuthUser {
  id: bigint;
  role: UserRole;
  companyId: bigint | null;
}

const BCRYPT_ROUNDS = 12;

function serializeUser(u: {
  id: bigint;
  companyId?: bigint | null;
  [key: string]: unknown;
}) {
  return {
    ...u,
    id:        u.id.toString(),
    companyId: u.companyId != null ? u.companyId.toString() : null,
  };
}

// ─── Get own profile ──────────────────────────────────────────────────────────

export async function getMe(userId: bigint) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, fullName: true, role: true,
      companyId: true, office: true, isActive: true, createdAt: true,
      company: { select: { id: true, name: true, region: true } },
    },
  });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");

  return {
    ...serializeUser(user),
    company: user.company
      ? { ...user.company, id: user.company.id.toString() }
      : null,
  };
}

// ─── Change own password ──────────────────────────────────────────────────────

export async function changePassword(userId: bigint, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");

  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) throw new AppError(401, "WRONG_PASSWORD", "Current password is incorrect");

  const newHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
}

// ─── List users (admin) ───────────────────────────────────────────────────────

export async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
    select: {
      id: true, email: true, fullName: true, role: true,
      companyId: true, office: true, isActive: true, createdAt: true,
      company: { select: { id: true, name: true } },
    },
  });

  return users.map((u) => ({
    ...serializeUser(u),
    company: u.company ? { ...u.company, id: u.company.id.toString() } : null,
  }));
}

// ─── Create user (admin) ──────────────────────────────────────────────────────

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError(409, "EMAIL_TAKEN", "Email is already registered");

  if (input.role === "client_user" && !input.companyId) {
    throw new AppError(422, "COMPANY_REQUIRED", "client_user must have a companyId");
  }
  if (input.companyId) {
    const company = await prisma.company.findUnique({ where: { id: input.companyId } });
    if (!company) throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email:        input.email,
      passwordHash,
      fullName:     input.fullName,
      role:         input.role,
      companyId:    input.companyId ?? null,
      office:       input.office   ?? null,
    },
    select: {
      id: true, email: true, fullName: true, role: true,
      companyId: true, office: true, isActive: true, createdAt: true,
    },
  });

  return serializeUser(user);
}

// ─── Get user (admin) ─────────────────────────────────────────────────────────

export async function getUser(id: bigint) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, fullName: true, role: true,
      companyId: true, office: true, isActive: true, createdAt: true,
      company: { select: { id: true, name: true, region: true } },
      userProductAccess: {
        select: {
          product: { select: { id: true, name: true, code: true, companyId: true } },
        },
      },
    },
  });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");

  const { userProductAccess, ...userBase } = user;
  return {
    ...serializeUser(userBase),
    company: user.company ? { ...user.company, id: user.company.id.toString() } : null,
    productAccess: userProductAccess.map((upa) => ({
      id:        upa.product.id.toString(),
      name:      upa.product.name,
      code:      upa.product.code,
      companyId: upa.product.companyId.toString(),
    })),
  };
}

// ─── Update user (admin) ──────────────────────────────────────────────────────

export async function updateUser(id: bigint, input: UpdateUserInput) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "USER_NOT_FOUND", "User not found");

  if (input.email && input.email !== existing.email) {
    const taken = await prisma.user.findUnique({ where: { email: input.email } });
    if (taken) throw new AppError(409, "EMAIL_TAKEN", "Email is already registered");
  }
  if (input.companyId) {
    const company = await prisma.company.findUnique({ where: { id: input.companyId } });
    if (!company) throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.email     && { email:     input.email }),
      ...(input.fullName  && { fullName:  input.fullName }),
      ...(input.role      && { role:      input.role }),
      ...(input.isActive  !== undefined && { isActive:  input.isActive }),
      ...(input.companyId !== undefined && { companyId: input.companyId }),
      ...(input.office    !== undefined && { office:    input.office }),
    },
    select: {
      id: true, email: true, fullName: true, role: true,
      companyId: true, office: true, isActive: true, createdAt: true,
    },
  });

  return serializeUser(user);
}

// ─── Grant product access (admin, engineer only) ──────────────────────────────

export async function grantProductAccess(
  userId: bigint,
  input: GrantProductAccessInput,
  _caller: AuthUser
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
  if (user.role !== "engineer") {
    throw new AppError(422, "NOT_ENGINEER", "Product access can only be granted to engineers");
  }

  const product = await prisma.products.findUnique({ where: { id: input.productId } });
  if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");

  await prisma.userProductAccess.upsert({
    where: { userId_productId: { userId, productId: input.productId } },
    create: { userId, productId: input.productId },
    update: {},
  });

  return {
    userId:    userId.toString(),
    productId: input.productId.toString(),
    product:   { id: product.id.toString(), name: product.name, code: product.code },
  };
}

// ─── Revoke product access (admin) ───────────────────────────────────────────

export async function revokeProductAccess(userId: bigint, productId: bigint) {
  const existing = await prisma.userProductAccess.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  if (!existing) {
    throw new AppError(404, "ACCESS_NOT_FOUND", "Product access record not found");
  }

  await prisma.userProductAccess.delete({
    where: { userId_productId: { userId, productId } },
  });
}
