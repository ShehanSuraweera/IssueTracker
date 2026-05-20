import { prisma } from "../../lib/prisma";
import { AppError } from "../../middleware/errorHandler";
import type { CreateCompanyInput, UpdateCompanyInput } from "./companies.schemas";

function serializeCompany(c: { id: bigint; [key: string]: unknown }) {
  return { ...c, id: c.id.toString() };
}

function serializeProduct(p: { id: bigint; companyId: bigint; [key: string]: unknown }) {
  return { ...p, id: p.id.toString(), companyId: p.companyId.toString() };
}

export async function listCompanies() {
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true, users: true } } },
  });
  return companies.map(serializeCompany);
}

export async function createCompany(input: CreateCompanyInput) {
  const existing = await prisma.company.findFirst({
    where: { contactEmail: input.contactEmail },
  });
  if (existing) {
    throw new AppError(409, "EMAIL_TAKEN", "A company with that contact email already exists");
  }

  const company = await prisma.company.create({
    data: {
      name: input.name,
      contactEmail: input.contactEmail,
      region: input.region,
    },
  });
  return serializeCompany(company);
}

export async function getCompany(id: bigint) {
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      products: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          owningOffice: true,
          description: true,
          createdAt: true,
          companyId: true,
          _count: { select: { issues: true } },
        },
      },
      _count: { select: { users: true } },
    },
  });
  if (!company) throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");

  return {
    ...serializeCompany(company),
    products: company.products.map(serializeProduct),
  };
}

export async function updateCompany(id: bigint, input: UpdateCompanyInput) {
  const existing = await prisma.company.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");

  if (input.contactEmail && input.contactEmail !== existing.contactEmail) {
    const taken = await prisma.company.findFirst({
      where: { contactEmail: input.contactEmail, id: { not: id } },
    });
    if (taken) throw new AppError(409, "EMAIL_TAKEN", "A company with that contact email already exists");
  }

  const company = await prisma.company.update({
    where: { id },
    data: {
      ...(input.name         && { name:         input.name }),
      ...(input.contactEmail && { contactEmail: input.contactEmail }),
      ...(input.region       && { region:       input.region }),
    },
  });
  return serializeCompany(company);
}
