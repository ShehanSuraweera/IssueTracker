/**
 * Internal comments are staff-only notes. Clients must never receive them,
 * whichever endpoint they read the thread through.
 */
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { bearer } from "./helpers/auth";
import { freshWorld, type World } from "./helpers/fixtures";

const app = createApp();
const bodies = (items: { body?: string }[]) => items.map((c) => c.body).filter(Boolean);

describe("internal comment visibility", () => {
  let w: World;
  beforeEach(async () => {
    w = await freshWorld();
  });

  it("issue detail hides internal comments from the client", async () => {
    const res = await request(app).get(`/api/issues/${w.issueA.id}`).set(bearer(w.clientA));
    expect(bodies(res.body.data.comments)).toEqual([w.publicCommentA.body]);
  });

  it.each(["all", "comments"])("feed (filter=%s) hides internal comments from the client", async (filter) => {
    const res = await request(app)
      .get(`/api/issues/${w.issueA.id}/feed?filter=${filter}`)
      .set(bearer(w.clientA));
    const comments = res.body.data.filter((i: { kind: string }) => i.kind === "comment");
    expect(bodies(comments)).toEqual([w.publicCommentA.body]);
  });

  it("staff see both public and internal comments", async () => {
    for (const staff of [w.engineerA, w.admin]) {
      const res = await request(app).get(`/api/issues/${w.issueA.id}`).set(bearer(staff));
      expect(bodies(res.body.data.comments).sort()).toEqual(
        [w.internalCommentA.body, w.publicCommentA.body].sort()
      );
    }
  });

  it("clients cannot post internal comments", async () => {
    const res = await request(app)
      .post(`/api/issues/${w.issueA.id}/comments`)
      .set(bearer(w.clientA))
      .send({ body: "trying to post internally", isInternal: true });
    expect(res.status).toBe(403);
    expect(await prisma.issueComment.count({ where: { issueId: w.issueA.id } })).toBe(2);
  });

  it("clients can post public comments on their own issue", async () => {
    const res = await request(app)
      .post(`/api/issues/${w.issueA.id}/comments`)
      .set(bearer(w.clientA))
      .send({ body: "Any update?" });
    expect(res.status).toBe(201);
    expect(res.body.data.isInternal).toBe(false);
  });
});
