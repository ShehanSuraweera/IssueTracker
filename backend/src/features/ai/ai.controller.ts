import { Request, Response } from "express";
import { env } from "../../config/env";

export function getConfig(_req: Request, res: Response): void {
  res.json({ data: { enabled: env.AI_ENABLED } });
}
