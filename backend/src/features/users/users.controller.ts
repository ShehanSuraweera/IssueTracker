import { Request, Response, NextFunction } from "express";
import { AppError } from "../../middleware/errorHandler";
import {
  CreateUserSchema,
  UpdateUserSchema,
  ChangePasswordSchema,
  GrantProductAccessSchema,
} from "./users.schemas";
import * as UserService from "./users.service";

function parseId(param: string | string[]): bigint {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!/^\d+$/.test(raw)) throw new AppError(400, "INVALID_ID", "ID must be a positive integer");
  return BigInt(raw);
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await UserService.getMe(req.user!.id);
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = ChangePasswordSchema.parse(req.body);
    await UserService.changePassword(req.user!.id, input);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listEngineers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const engineers = await UserService.listEngineers();
    res.json({ data: engineers });
  } catch (err) {
    next(err);
  }
}

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await UserService.listUsers();
    res.json({ data: users });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = CreateUserSchema.parse(req.body);
    const user = await UserService.createUser(input);
    res.status(201).json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const user = await UserService.getUser(id);
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const input = UpdateUserSchema.parse(req.body);
    const user = await UserService.updateUser(id, input);
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function grantProductAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const input = GrantProductAccessSchema.parse(req.body);
    const result = await UserService.grantProductAccess(id, input, req.user!);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function revokeProductAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId    = parseId(req.params.id);
    const productId = parseId(req.params.productId);
    await UserService.revokeProductAccess(userId, productId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
