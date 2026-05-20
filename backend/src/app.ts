import express from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import { v4 as uuidv4 } from "uuid";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { swaggerSpec } from "./docs/swagger";
import authRoutes from "./features/auth/auth.routes";

export function createApp() {
  const app = express();

  // ─── Security Headers ──────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
    })
  );

  // ─── CORS ─────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })
  );

  // ─── Request Parsing ───────────────────────────────────────────────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  // ─── Structured Logging ────────────────────────────────────────────────────
  app.use(
    pinoHttp({
      genReqId: () => uuidv4(),
      quietReqLogger: env.NODE_ENV !== "development",
      customLogLevel: (_req, res) =>
        res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    })
  );

  // Attach request ID to req object for error handler
  app.use((req, _res, next) => {
    req.requestId = (req as express.Request & { id?: string }).id;
    next();
  });

  // ─── API Docs ──────────────────────────────────────────────────────────────
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: "NewnopDesk API Docs",
      customCss: `
        .swagger-ui .topbar { background-color: #082A9C; }
        .swagger-ui .topbar-wrapper img { content: none; }
        .swagger-ui .topbar-wrapper::after { content: 'NewnopDesk API'; color: white; font-size: 18px; font-weight: 600; }
      `,
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
      },
    })
  );

  // Serve raw OpenAPI JSON for external tooling
  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  // ─── Routes ────────────────────────────────────────────────────────────────
  app.use("/api/auth", authRoutes);

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  });

  // ─── 404 Handler ──────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  // ─── Global Error Handler ─────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
