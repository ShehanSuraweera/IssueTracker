import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { User } from "@prisma/client";
import { createApp } from "../src/app";
import { bearer } from "./helpers/auth";
import { freshWorld, type World } from "./helpers/fixtures";

const app = createApp();

describe("product tenancy", () => {
  let w: World;
  beforeAll(async () => {
    w = await freshWorld();
  });

  it("clients and engineers list only the products they may see", async () => {
    const cases: [User, string[]][] = [
      [w.clientA, ["ACME"]],
      [w.clientB, ["GLOBEX"]],
      [w.engineerB, ["GLOBEX"]],
      [w.admin, ["ACME", "GLOBEX"]],
    ];
    for (const [user, expected] of cases) {
      const res = await request(app).get("/api/products").set(bearer(user));
      expect(res.status).toBe(200);
      expect(res.body.data.map((p: { code: string }) => p.code).sort()).toEqual(expected);
    }
  });

  it.each([
    ["client of another company", (w: World) => w.clientB],
    ["engineer without product access", (w: World) => w.engineerB],
  ])("%s gets 404 for another company's product", async (_label, pick) => {
    const res = await request(app).get(`/api/products/${w.productA.id}`).set(bearer(pick(w)));
    expect(res.status).toBe(404);
  });
});

describe("admin-only routes", () => {
  let w: World;
  beforeAll(async () => {
    w = await freshWorld();
  });

  it.each(["/api/companies", "/api/users", "/api/issues/export"])(
    "GET %s is forbidden to clients and engineers",
    async (path) => {
      for (const user of [w.clientA, w.engineerA]) {
        const res = await request(app).get(path).set(bearer(user));
        expect(res.status).toBe(403);
      }
      const asAdmin = await request(app).get(path).set(bearer(w.admin));
      expect(asAdmin.status).toBe(200);
    }
  );
});
