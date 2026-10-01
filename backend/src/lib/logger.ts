import pino from "pino";

// Application logger for code outside the request cycle (e.g. background workers).
// Request logs come from pino-http in app.ts.
export const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : (process.env.LOG_LEVEL ?? "info"),
});
