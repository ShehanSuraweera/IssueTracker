import { z } from "zod";

const bigIntParam = z
  .string()
  .regex(/^\d+$/, "Must be a numeric ID")
  .transform((s) => BigInt(s));

const OfficeEnum = z.enum(["KR", "LK", "IN"]);

export const CreateProductSchema = z.object({
  companyId: bigIntParam,
  name: z.string().min(1).max(120),
  code: z
    .string()
    .min(1)
    .max(8)
    .regex(/^[A-Z0-9]+$/, "Code must be uppercase letters and digits only"),
  owningOffice: OfficeEnum,
  description: z.string().max(5000).optional(),
});

export const UpdateProductSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    owningOffice: OfficeEnum.optional(),
    description: z.string().max(5000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
