import { Request, Response, NextFunction } from "express";
import { AppError } from "../../middleware/errorHandler";
import { CreateCompanySchema, UpdateCompanySchema } from "./companies.schemas";
import * as CompanyService from "./companies.service";

function parseId(param: string | string[]): bigint {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!/^\d+$/.test(raw)) throw new AppError(400, "INVALID_ID", "ID must be a positive integer");
  return BigInt(raw);
}

export async function list(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const companies = await CompanyService.listCompanies();
    res.json({ data: companies });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = CreateCompanySchema.parse(req.body);
    const company = await CompanyService.createCompany(input);
    res.status(201).json({ data: company });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const company = await CompanyService.getCompany(id);
    res.json({ data: company });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const input = UpdateCompanySchema.parse(req.body);
    const company = await CompanyService.updateCompany(id, input);
    res.json({ data: company });
  } catch (err) {
    next(err);
  }
}
