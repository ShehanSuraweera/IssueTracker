import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { bearer } from "./helpers/auth";
import { freshWorld, type World } from "./helpers/fixtures";

describe("GET /api/ai/config", () => {
  let w: World;
  beforeAll(async () => {
    w = await freshWorld();
  });

  it("requires authentication", async () => {
    const res = await request(createApp()).get("/api/ai/config");
    expect(res.status).toBe(401);
  });

  it("reports the AI layer as disabled by default", async () => {
    const res = await request(createApp()).get("/api/ai/config").set(bearer(w.clientA));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { enabled: false } });
  });

  it("with AI disabled, AI endpoints say so and new issues queue no AI work", async () => {
    const res = await request(createApp())
      .get(`/api/issues/${w.issueA.id}/ai/suggestion`)
      .set(bearer(w.engineerA));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("AI_DISABLED");

    const created = await request(createApp())
      .post("/api/issues")
      .set(bearer(w.clientA))
      .send({ productId: w.productA.id.toString(), title: "t", description: "d", type: "bug" });
    expect(created.status).toBe(201);
    expect(await prisma.aiJob.count()).toBe(0);
  });

  it("reports the AI layer as enabled when AI_ENABLED=true", async () => {
    // env.ts is read once at import time, so load a fresh copy of the app
    vi.resetModules();
    process.env.AI_ENABLED = "true";
    process.env.AI_SERVICE_TOKEN = "t".repeat(40);
    try {
      const { createApp: createFreshApp } = await import("../src/app");
      const res = await request(createFreshApp()).get("/api/ai/config").set(bearer(w.admin));
      expect(res.body).toEqual({ data: { enabled: true } });
    } finally {
      process.env.AI_ENABLED = "false";
      delete process.env.AI_SERVICE_TOKEN;
      vi.resetModules();
    }
  });

  it("refuses to start with AI_ENABLED=true but no AI_SERVICE_TOKEN", async () => {
    vi.resetModules();
    process.env.AI_ENABLED = "true";
    delete process.env.AI_SERVICE_TOKEN;
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(import("../src/config/env")).rejects.toThrow("process.exit called");
      expect(exit).toHaveBeenCalledWith(1);
      expect(logged.mock.calls.flat().join(" ")).toContain("AI_SERVICE_TOKEN is required");
    } finally {
      exit.mockRestore();
      logged.mockRestore();
      process.env.AI_ENABLED = "false";
      vi.resetModules();
    }
  });
});
