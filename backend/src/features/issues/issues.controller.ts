import { Request, Response, NextFunction } from "express";
import { AppError } from "../../middleware/errorHandler";
import {
  CreateIssueSchema,
  UpdateIssueSchema,
  ListIssuesQuerySchema,
  AssignIssueSchema,
  ExportQuerySchema,
  CreateCommentSchema,
  PresignUploadSchema,
  ConfirmAttachmentSchema,
  FeedQuerySchema,
} from "./issues.schemas";
import * as IssueService from "./issues.service";

function parseId(param: string | string[]): bigint {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!/^\d+$/.test(raw)) {
    throw new AppError(400, "INVALID_ID", "ID must be a positive integer");
  }
  return BigInt(raw);
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListIssuesQuerySchema.parse(req.query);
    const result = await IssueService.listIssues(query, req.user!);
    res.json({ data: result.data, pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = CreateIssueSchema.parse(req.body);
    const issue = await IssueService.createIssue(input, req.user!);
    res.status(201).json({ data: issue });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const issue = await IssueService.getIssue(id, req.user!);
    res.json({ data: issue });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const input = UpdateIssueSchema.parse(req.body);
    const issue = await IssueService.updateIssue(id, input, req.user!);
    res.json({ data: issue });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    await IssueService.deleteIssue(id, req.user!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function assign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const input = AssignIssueSchema.parse(req.body);
    const issue = await IssueService.assignIssue(id, input, req.user!);
    res.json({ data: issue });
  } catch (err) {
    next(err);
  }
}

export async function resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const issue = await IssueService.resolveIssue(id, req.user!);
    res.json({ data: issue });
  } catch (err) {
    next(err);
  }
}

export async function stats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await IssueService.getStats(req.user!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function exportData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ExportQuerySchema.parse(req.query);
    const result = await IssueService.exportIssues(query);

    if (result.format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=issues.csv");
      res.send(result.content);
    } else {
      res.json({ data: result.content, count: result.count });
    }
  } catch (err) {
    next(err);
  }
}

export async function addComment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const input = CreateCommentSchema.parse(req.body);
    const comment = await IssueService.addComment(id, input, req.user!);
    res.status(201).json({ data: comment });
  } catch (err) {
    next(err);
  }
}

export async function presignUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const input = PresignUploadSchema.parse(req.body);
    const result = await IssueService.presignUpload(id, input, req.user!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function confirmAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const input = ConfirmAttachmentSchema.parse(req.body);
    const attachment = await IssueService.confirmAttachment(id, input, req.user!);
    res.status(201).json({ data: attachment });
  } catch (err) {
    next(err);
  }
}

export async function getFeed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id    = parseId(req.params.id);
    const query = FeedQuerySchema.parse(req.query);
    const result = await IssueService.getFeed(id, req.user!, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getDownloadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const attId = parseId(req.params.attId);
    const result = await IssueService.getDownloadUrl(id, attId, req.user!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
