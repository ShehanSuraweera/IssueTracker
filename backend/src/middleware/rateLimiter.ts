import rateLimit from "express-rate-limit";

// 5 attempts per 15 minutes per IP — applied to all auth write endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again in 15 minutes.",
    },
  },
  skipSuccessfulRequests: false,
});

// Lighter limit for read endpoints (me, refresh)
export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Slow down.",
    },
  },
});
