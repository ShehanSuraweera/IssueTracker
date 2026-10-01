/**
 * Tenant isolation for issues and their sub-resources.
 *
 * Outsiders are a client from another company and an engineer without access
 * to the product. Every probe must return 404 ISSUE_NOT_FOUND — not 403,
 * which would confirm the issue exists — and must change nothing.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Test } from "supertest";
import type { User } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { bearer } from "./helpers/auth";
import { freshWorld, type World } from "./helpers/fixtures";

const app = createApp();
const agent = () => request(app);

type Probe = { name: string; send: (w: World) => Test };

// Each probe targets Acme's issue (issue A). Bodies are valid so a request
// reaches the tenancy check instead of failing input validation.
const probes: Probe[] = [
  { name: "GET    /issues/:id", send: (w) => agent().get(`/api/issues/${w.issueA.id}`) },
  { name: "PATCH  /issues/:id", send: (w) => agent().patch(`/api/issues/${w.issueA.id}`).send({ title: "changed by outsider" }) },
  { name: "GET    /issues/:id/feed", send: (w) => agent().get(`/api/issues/${w.issueA.id}/feed`) },
  { name: "POST   /issues/:id/comments", send: (w) => agent().post(`/api/issues/${w.issueA.id}/comments`).send({ body: "outsider comment" }) },
  {
    name: "POST   /issues/:id/attachments/presign",
    send: (w) => agent().post(`/api/issues/${w.issueA.id}/attachments/presign`)
      .send({ filename: "x.pdf", mimeType: "application/pdf", sizeBytes: 100 }),
  },
  {
    name: "POST   /issues/:id/attachments",
    send: (w) => agent().post(`/api/issues/${w.issueA.id}/attachments`)
      .send({ s3Key: "issues/x/y/x.pdf", filename: "x.pdf", mimeType: "application/pdf", sizeBytes: 100 }),
  },
  {
    name: "GET    /issues/:id/attachments/:attId/download",
    send: (w) => agent().get(`/api/issues/${w.issueA.id}/attachments/${w.attachmentA.id}/download`),
  },
];

const outsiders: [string, (w: World) => User][] = [
  ["client of another company", (w) => w.clientB],
  ["engineer without product access", (w) => w.engineerB],
];

describe("issue tenancy", () => {
  let w: World;
  let snapshotBefore: unknown;

  beforeAll(async () => {
    w = await freshWorld();
    snapshotBefore = await snapshotIssueA(w);
  });

  describe.each(outsiders)("%s", (_label, outsider) => {
    it.each(probes)("$name → 404", async ({ send }) => {
      const res = await send(w).set(bearer(outsider(w)));
      expect(res.status).toBe(404);
      // ISSUE_NOT_FOUND (not the router's NOT_FOUND) proves the route matched
      // and the service's tenancy check is what rejected the request
      expect(res.body.error.code).toBe("ISSUE_NOT_FOUND");
    });
  });

  it("engineer without product access cannot resolve the issue", async () => {
    const res = await agent().post(`/api/issues/${w.issueA.id}/resolve`).set(bearer(w.engineerB));
    expect(res.status).toBe(404);
  });

  it("clients cannot resolve any issue", async () => {
    const res = await agent().post(`/api/issues/${w.issueA.id}/resolve`).set(bearer(w.clientA));
    expect(res.status).toBe(403);
  });

  it("insiders can reach the same issue (positive control)", async () => {
    for (const insider of [w.clientA, w.engineerA, w.admin]) {
      const detail = await agent().get(`/api/issues/${w.issueA.id}`).set(bearer(insider));
      expect(detail.status).toBe(200);
      const feed = await agent().get(`/api/issues/${w.issueA.id}/feed`).set(bearer(insider));
      expect(feed.status).toBe(200);
    }
  });

  it("rejected probes left issue A completely unchanged", async () => {
    expect(await snapshotIssueA(w)).toEqual(snapshotBefore);
  });

  describe("GET /issues (list)", () => {
    const listIds = async (user: User, query = "") => {
      const res = await agent().get(`/api/issues${query}`).set(bearer(user));
      expect(res.status).toBe(200);
      return res.body.data.map((i: { id: string }) => i.id).sort();
    };

    it("each client sees only their own company's issues", async () => {
      expect(await listIds(w.clientA)).toEqual([w.issueA.id.toString()]);
      expect(await listIds(w.clientB)).toEqual([w.issueB.id.toString()]);
    });

    it("each engineer sees only issues on products they can access", async () => {
      expect(await listIds(w.engineerA)).toEqual([w.issueA.id.toString()]);
      expect(await listIds(w.engineerB)).toEqual([w.issueB.id.toString()]);
    });

    it("admins see every company's issues", async () => {
      expect(await listIds(w.admin)).toEqual([w.issueA.id, w.issueB.id].map(String).sort());
    });

    it("search cannot reach another company's issues", async () => {
      expect(await listIds(w.clientA, "?search=invoices")).toEqual([w.issueA.id.toString()]);
      expect(await listIds(w.clientB, "?search=invoices")).toEqual([]);
    });

    it("filtering by another company's product returns nothing", async () => {
      expect(await listIds(w.clientB, `?product_id=${w.productA.id}`)).toEqual([]);
      expect(await listIds(w.engineerB, `?product_id=${w.productA.id}`)).toEqual([]);
    });
  });

  it("dashboard stats count only the caller's own issues", async () => {
    const res = await agent().get("/api/issues/stats").set(bearer(w.clientB));
    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalOpen).toBe(1);
  });

  it.each(outsiders)("%s cannot create an issue on another company's product", async (_label, outsider) => {
    const res = await agent()
      .post("/api/issues")
      .set(bearer(outsider(w)))
      .send({ productId: w.productA.id.toString(), title: "planted", description: "planted", type: "bug" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("PRODUCT_NOT_FOUND");
    expect(await prisma.issue.count({ where: { productId: w.productA.id } })).toBe(1);
  });
});

describe("issue assignment tenancy", () => {
  let w: World;
  beforeEach(async () => {
    w = await freshWorld();
  });

  const assign = (issueId: bigint, actor: User, assignee: User) =>
    agent()
      .post(`/api/issues/${issueId}/assign`)
      .set(bearer(actor))
      .send({ assigneeId: assignee.id.toString() });

  // Regression test. assignIssue() used to load the issue by ID alone, so an
  // engineer could assign any issue in the system and the response leaked its
  // title and the client's email.
  it("engineer without product access gets 404 and the issue is unchanged", async () => {
    const before = await snapshotIssueA(w);

    const res = await assign(w.issueA.id, w.engineerB, w.engineerB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ISSUE_NOT_FOUND");
    // Nothing about issue A may appear in the error response
    expect(JSON.stringify(res.body)).not.toContain(w.issueA.title);
    expect(JSON.stringify(res.body)).not.toContain(w.clientA.email);

    expect(await snapshotIssueA(w)).toEqual(before);
  });

  it("engineer with product access can assign the issue to themselves", async () => {
    const res = await assign(w.issueA.id, w.engineerA, w.engineerA);
    expect(res.status).toBe(200);
    expect(res.body.data.assignee.id).toBe(w.engineerA.id.toString());
  });

  it("admins can assign issues in any company", async () => {
    expect((await assign(w.issueA.id, w.admin, w.engineerA)).status).toBe(200);
    expect((await assign(w.issueB.id, w.admin, w.engineerB)).status).toBe(200);
  });
});

/** Everything about issue A that a cross-tenant request might change. */
async function snapshotIssueA(w: World) {
  const issue = await prisma.issue.findUniqueOrThrow({ where: { id: w.issueA.id } });
  const [comments, attachments, activities] = await Promise.all([
    prisma.issueComment.count({ where: { issueId: w.issueA.id } }),
    prisma.issueAttachment.count({ where: { issueId: w.issueA.id } }),
    prisma.issueActivity.count({ where: { issueId: w.issueA.id } }),
  ]);
  return { issue, comments, attachments, activities };
}
