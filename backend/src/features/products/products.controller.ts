import { Request, Response, NextFunction } from "express";
import { AppError } from "../../middleware/errorHandler";
import { CreateProductSchema, UpdateProductSchema } from "./products.schemas";
import * as ProductService from "./products.service";

function parseId(param: string | string[]): bigint {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!/^\d+$/.test(raw)) throw new AppError(400, "INVALID_ID", "ID must be a positive integer");
  return BigInt(raw);
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const products = await ProductService.listProducts(req.user!);
    res.json({ data: products });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = CreateProductSchema.parse(req.body);
    const product = await ProductService.createProduct(input);
    res.status(201).json({ data: product });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const product = await ProductService.getProduct(id, req.user!);
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id);
    const input = UpdateProductSchema.parse(req.body);
    const product = await ProductService.updateProduct(id, input);
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
}
