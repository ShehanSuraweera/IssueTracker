import { UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import type { CreateProductInput, UpdateProductInput } from "./products.schemas";

interface AuthUser {
  id: bigint;
  role: UserRole;
  companyId: bigint | null;
}

function serializeProduct(p: { id: bigint; companyId: bigint; [key: string]: unknown }) {
  return { ...p, id: p.id.toString(), companyId: p.companyId.toString() };
}

export async function listProducts(user: AuthUser) {
  const where =
    user.role === "admin"
      ? {}
      : user.role === "engineer"
      ? { userProductAccess: { some: { userId: user.id } } }
      : { companyId: user.companyId ?? BigInt(-1) };

  const products = await prisma.products.findMany({
    where,
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
    include: {
      company: { select: { id: true, name: true, region: true } },
      _count: { select: { issues: true } },
    },
  });

  return products.map((p) => ({
    ...serializeProduct(p),
    company: { ...p.company, id: p.company.id.toString() },
  }));
}

export async function createProduct(input: CreateProductInput) {
  const company = await prisma.company.findUnique({ where: { id: input.companyId } });
  if (!company) throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");

  const codeConflict = await prisma.products.findUnique({ where: { code: input.code } });
  if (codeConflict) throw new AppError(409, "CODE_TAKEN", "A product with that code already exists");

  const product = await prisma.products.create({
    data: {
      companyId:    input.companyId,
      name:         input.name,
      code:         input.code,
      owningOffice: input.owningOffice,
      description:  input.description ?? null,
    },
    include: { company: { select: { id: true, name: true, region: true } } },
  });

  return {
    ...serializeProduct(product),
    company: { ...product.company, id: product.company.id.toString() },
  };
}

export async function getProduct(id: bigint, user: AuthUser) {
  const where =
    user.role === "admin"
      ? { id }
      : user.role === "engineer"
      ? { id, userProductAccess: { some: { userId: user.id } } }
      : { id, companyId: user.companyId ?? BigInt(-1) };

  const product = await prisma.products.findFirst({
    where,
    include: {
      company: { select: { id: true, name: true, region: true } },
      _count: { select: { issues: true } },
    },
  });
  if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");

  return {
    ...serializeProduct(product),
    company: { ...product.company, id: product.company.id.toString() },
  };
}

export async function updateProduct(id: bigint, input: UpdateProductInput) {
  const existing = await prisma.products.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");

  const product = await prisma.products.update({
    where: { id },
    data: {
      ...(input.name         && { name:         input.name }),
      ...(input.owningOffice && { owningOffice: input.owningOffice }),
      ...(input.description !== undefined && { description: input.description }),
    },
    include: { company: { select: { id: true, name: true, region: true } } },
  });

  return {
    ...serializeProduct(product),
    company: { ...product.company, id: product.company.id.toString() },
  };
}
