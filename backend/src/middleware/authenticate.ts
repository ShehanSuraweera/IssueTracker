import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { env } from "../config/env";
import { AppError } from "./errorHandler";

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string | null;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.jwtPublicKey, {
      algorithms: ["RS256"],
    }) as AccessTokenPayload;

    req.user = {
      id: BigInt(payload.sub),
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId ? BigInt(payload.companyId) : null,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, "TOKEN_EXPIRED", "Access token has expired"));
    }
    next(new AppError(401, "TOKEN_INVALID", "Access token is invalid"));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "FORBIDDEN", "Insufficient permissions"));
    }
    next();
  };
}
