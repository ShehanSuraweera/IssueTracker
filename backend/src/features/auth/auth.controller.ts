import { Request, Response, NextFunction } from "express";
import {
  RegisterSchema,
  LoginSchema,
  RefreshSchema,
  LogoutSchema,
  RequestAccessSchema,
} from "./auth.schemas";
import * as AuthService from "./auth.service";

function getMeta(req: Request) {
  return {
    ipAddress: (req.ip ?? "").replace("::ffff:", ""),
    userAgent: req.headers["user-agent"],
  };
}

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = RegisterSchema.parse(req.body);
    const result = await AuthService.register(input, getMeta(req));
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = LoginSchema.parse(req.body);
    const result = await AuthService.login(input, getMeta(req));
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = RefreshSchema.parse(req.body);
    const result = await AuthService.refresh(refreshToken, getMeta(req));
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = LogoutSchema.parse(req.body);
    await AuthService.logout(req.user!.id, refreshToken);
    res.status(200).json({ data: { message: "Logged out successfully" } });
  } catch (err) {
    next(err);
  }
}

export async function requestAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = RequestAccessSchema.parse(req.body);
    const result = await AuthService.requestAccess(input);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function me(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await AuthService.getMe(req.user!.id);
    res.status(200).json({ data: { user } });
  } catch (err) {
    next(err);
  }
}
