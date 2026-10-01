import { createHmac, generateKeyPairSync } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { tokenFor } from "./helpers/auth";
import { TEST_PASSWORD, freshWorld, type World } from "./helpers/fixtures";

const app = createApp();

function me(token?: string) {
  const req = request(app).get("/api/users/me");
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
}

function claimsFor(w: World) {
  return {
    sub: w.clientA.id.toString(),
    email: w.clientA.email,
    role: w.clientA.role,
    companyId: w.clientA.companyId!.toString(),
  };
}

describe("authentication", () => {
  let w: World;
  beforeAll(async () => {
    w = await freshWorld();
  });

  it("rejects requests without a token", async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a malformed token", async () => {
    const res = await me("not-a-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_INVALID");
  });

  it("rejects a token signed with someone else's private key", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const forged = jwt.sign(claimsFor(w), privateKey, { algorithm: "RS256" });
    const res = await me(forged);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_INVALID");
  });

  it("rejects the HS256 algorithm-confusion attack", async () => {
    // A classic JWT attack: sign with HS256, using the server's *public* key
    // as the HMAC secret. A verifier that trusted the token's alg header
    // would accept it. Ours pins algorithms: ["RS256"].
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claimsFor(w))}`;
    const signature = createHmac("sha256", env.jwtPublicKey).update(unsigned).digest("base64url");
    const res = await me(`${unsigned}.${signature}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_INVALID");
  });

  it("rejects an expired token with a distinct error code", async () => {
    const expired = jwt.sign(
      { ...claimsFor(w), exp: Math.floor(Date.now() / 1000) - 60 },
      env.jwtPrivateKey,
      { algorithm: "RS256" }
    );
    const res = await me(expired);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("treats a token from a real login and a token from the test helper the same", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: w.clientA.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);

    const viaLogin = await me(login.body.data.accessToken);
    const viaHelper = await me(tokenFor(w.clientA));
    expect(viaLogin.status).toBe(200);
    expect(viaHelper.body).toEqual(viaLogin.body);
  });
});
