/**
 * Builds a small two-tenant world for tests:
 *
 *   Acme  (company A) — product ACME,   client clientA, engineer engineerA
 *   Globex (company B) — product GLOBEX, client clientB, engineer engineerB
 *   plus one admin who sees everything
 *
 * Each company has one issue. Acme's issue has a public comment, an internal
 * comment, and an attachment, so every sub-resource can be probed across the
 * tenant boundary.
 */
import bcrypt from "bcrypt";
import type { ImpactLevel, PriorityLevel, Prisma, UrgencyLevel } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { resetDatabase } from "./db";

export const TEST_PASSWORD = "Test@12345";

// Low cost factor: these hashes only exist for the test run
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

// Duplicated from issues.service.ts on purpose: if the production matrix
// changes, the priority tests should fail rather than silently follow it
export const EXPECTED_PRIORITY: Record<ImpactLevel, Record<UrgencyLevel, PriorityLevel>> = {
  low:    { low: "low",      medium: "low",      high: "moderate" },
  medium: { low: "low",      medium: "moderate", high: "high"     },
  high:   { low: "moderate", medium: "high",     high: "critical" },
};

export async function createWorld() {
  const companyA = await prisma.company.create({
    data: { name: "Acme", contactEmail: "contact@acme.test", region: "LK" },
  });
  const companyB = await prisma.company.create({
    data: { name: "Globex", contactEmail: "contact@globex.test", region: "KR" },
  });

  const productA = await prisma.products.create({
    data: { companyId: companyA.id, name: "Acme Portal", code: "ACME", owningOffice: "LK" },
  });
  const productB = await prisma.products.create({
    data: { companyId: companyB.id, name: "Globex App", code: "GLOBEX", owningOffice: "KR" },
  });

  const user = (data: Omit<Prisma.UserUncheckedCreateInput, "passwordHash">) =>
    prisma.user.create({ data: { ...data, passwordHash } });

  const admin     = await user({ email: "admin@newnop.test",      fullName: "Test Admin",      role: "admin",       office: "KR" });
  const engineerA = await user({ email: "engineer-a@newnop.test", fullName: "Engineer Acme",   role: "engineer",    office: "LK" });
  const engineerB = await user({ email: "engineer-b@newnop.test", fullName: "Engineer Globex", role: "engineer",    office: "KR" });
  const clientA   = await user({ email: "client@acme.test",       fullName: "Client Acme",     role: "client_user", companyId: companyA.id });
  const clientB   = await user({ email: "client@globex.test",     fullName: "Client Globex",   role: "client_user", companyId: companyB.id });

  await prisma.userProductAccess.createMany({
    data: [
      { userId: engineerA.id, productId: productA.id },
      { userId: engineerB.id, productId: productB.id },
    ],
  });

  const issueA = await prisma.issue.create({
    data: {
      ticketNumber: "ACME-0001",
      productId: productA.id,
      title: "Acme invoices export as blank PDF",
      description: "Every invoice exported since Monday is a blank page.",
      type: "bug",
      impact: "high",
      urgency: "medium",
      priority: "high",
      createdBy: clientA.id,
    },
  });
  const issueB = await prisma.issue.create({
    data: {
      ticketNumber: "GLOBEX-0001",
      productId: productB.id,
      title: "Globex login page is slow",
      description: "The login page takes 10 seconds to load.",
      type: "bug",
      impact: "medium",
      urgency: "medium",
      priority: "moderate",
      createdBy: clientB.id,
    },
  });

  const publicCommentA = await prisma.issueComment.create({
    data: { issueId: issueA.id, userId: engineerA.id, body: "We are looking into it.", isInternal: false },
  });
  const internalCommentA = await prisma.issueComment.create({
    data: { issueId: issueA.id, userId: engineerA.id, body: "INTERNAL: PDF renderer OOMs on large logos.", isInternal: true },
  });
  const attachmentA = await prisma.issueAttachment.create({
    data: {
      issueId: issueA.id,
      s3Key: `issues/${issueA.id}/test/invoice.pdf`,
      filename: "invoice.pdf",
      sizeBytes: BigInt(1024),
      mimeType: "application/pdf",
      uploadedBy: clientA.id,
    },
  });

  return {
    companyA, companyB, productA, productB,
    admin, engineerA, engineerB, clientA, clientB,
    issueA, issueB, publicCommentA, internalCommentA, attachmentA,
  };
}

export type World = Awaited<ReturnType<typeof createWorld>>;

/** Clears the database and builds a new world. */
export async function freshWorld(): Promise<World> {
  await resetDatabase();
  return createWorld();
}
