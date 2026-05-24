import { z } from "zod";

const RegionEnum = z.enum(["KR", "LK", "IN", "GLOBAL"]);

export const CreateCompanySchema = z.object({
  name: z.string().min(1).max(120),
  contactEmail: z.email().max(255),
  region: RegionEnum,
});

export const UpdateCompanySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    contactEmail: z.email().max(255).optional(),
    region: RegionEnum.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof UpdateCompanySchema>;
