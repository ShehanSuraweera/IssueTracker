/**
 * Priority is derived from impact × urgency (ITIL matrix), never chosen
 * directly. The AI features must never change this, so the rule is pinned
 * here before any AI code exists.
 */
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { bearer } from "./helpers/auth";
import { EXPECTED_PRIORITY, freshWorld, type World } from "./helpers/fixtures";

const app = createApp();
const levels = ["low", "medium", "high"] as const;
const combos = levels.flatMap((impact) => levels.map((urgency) => ({ impact, urgency })));

describe("ITIL priority matrix", () => {
  let w: World;
  beforeEach(async () => {
    w = await freshWorld();
  });

  it.each(combos)("impact=$impact × urgency=$urgency", async ({ impact, urgency }) => {
    const res = await request(app)
      .post("/api/issues")
      .set(bearer(w.clientA))
      .send({ productId: w.productA.id.toString(), title: "t", description: "d", type: "bug", impact, urgency });
    expect(res.status).toBe(201);
    expect(res.body.data.priority).toBe(EXPECTED_PRIORITY[impact][urgency]);
  });

  it("defaults to medium × medium = moderate when impact and urgency are omitted", async () => {
    const res = await request(app)
      .post("/api/issues")
      .set(bearer(w.clientA))
      .send({ productId: w.productA.id.toString(), title: "t", description: "d", type: "question" });
    expect(res.body.data).toMatchObject({ impact: "medium", urgency: "medium", priority: "moderate" });
  });

  it("recomputes priority and logs it when an engineer changes urgency", async () => {
    // Issue A starts at impact=high, urgency=medium, so priority=high
    const res = await request(app)
      .patch(`/api/issues/${w.issueA.id}`)
      .set(bearer(w.engineerA))
      .send({ urgency: "high" });
    expect(res.status).toBe(200);
    expect(res.body.data.priority).toBe("critical");

    const logged = await prisma.issueActivity.findMany({
      where: { issueId: w.issueA.id },
      select: { fieldName: true, oldValue: true, newValue: true },
    });
    expect(logged).toEqual(
      expect.arrayContaining([
        { fieldName: "urgency", oldValue: "medium", newValue: "high" },
        { fieldName: "priority", oldValue: "high", newValue: "critical" },
      ])
    );
  });
});
