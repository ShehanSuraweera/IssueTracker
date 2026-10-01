import { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";
import { AppError } from "../../middleware/errorHandler";
import { ReviewSuggestionSchema } from "./ai.schemas";
import * as AiService from "./ai.service";

function parseId(param: string | string[] | undefined, name = "ID"): bigint {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!raw || !/^\d+$/.test(raw)) {
    throw new AppError(400, "INVALID_ID", `${name} must be a positive integer`);
  }
  return BigInt(raw);
}

export function getConfig(_req: Request, res: Response): void {
  res.json({ data: { enabled: env.AI_ENABLED } });
}

export async function getSuggestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await AiService.getSuggestion(parseId(req.params.id), req.user!);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function reviewSuggestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = ReviewSuggestionSchema.parse(req.body);
    const data = await AiService.reviewSuggestion(
      parseId(req.params.id),
      parseId(req.params.suggestionId, "Suggestion ID"),
      input,
      req.user!
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function retryAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await AiService.retryAnalysis(parseId(req.params.id), req.user!);
    res.status(202).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getSentimentTimeline(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await AiService.getSentimentTimeline(parseId(req.params.id), req.user!);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
