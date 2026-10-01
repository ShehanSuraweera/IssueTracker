import { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";
import { AppError } from "../../middleware/errorHandler";
import {
  ClientHealthQuerySchema,
  ResolutionFeedbackSchema,
  ReviewSuggestionSchema,
} from "./ai.schemas";
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

// Synchronous AI calls reuse the request's own ID so one ID traces the request
// from the browser through this backend into the AI service's logs
function traceId(req: Request): string {
  return (req.requestId ?? "no-request-id").slice(0, 64);
}

export async function getSimilarIssues(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await AiService.getSimilarIssues(parseId(req.params.id), req.user!, traceId(req));
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getLatestResolution(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await AiService.getLatestResolution(parseId(req.params.id), req.user!);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function requestResolution(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await AiService.requestResolution(parseId(req.params.id), req.user!, traceId(req));
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function giveResolutionFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { feedback } = ResolutionFeedbackSchema.parse(req.body);
    const data = await AiService.giveResolutionFeedback(
      parseId(req.params.id),
      parseId(req.params.resolutionId, "Resolution ID"),
      feedback,
      req.user!
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getThreadSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await AiService.getThreadSummary(parseId(req.params.id), req.user!);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function requestThreadSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await AiService.requestThreadSummary(parseId(req.params.id), req.user!, traceId(req));
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getEscalations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await AiService.getEscalations(req.user!);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getClientHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { days } = ClientHealthQuerySchema.parse(req.query);
    const data = await AiService.getClientHealth(days, req.user!);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
