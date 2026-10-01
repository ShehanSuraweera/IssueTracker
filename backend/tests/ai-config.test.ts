import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
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

  it("reports the AI layer as enabled when AI_ENABLED=true", async () => {
    // env.ts is read once at import time, so load a fresh copy of the app
    vi.resetModules();
    process.env.AI_ENABLED = "true";
    try {
      const { createApp: createFreshApp } = await import("../src/app");
      const res = await request(createFreshApp()).get("/api/ai/config").set(bearer(w.admin));
      expect(res.body).toEqual({ data: { enabled: true } });
    } finally {
      process.env.AI_ENABLED = "false";
      vi.resetModules();
    }
  });
});
