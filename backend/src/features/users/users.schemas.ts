import { z } from "zod";

const bigIntParam = z
  .string()
  .regex(/^\d+$/, "Must be a numeric ID")
  .transform((s) => BigInt(s));

const OfficeEnum   = z.enum(["KR", "LK", "IN"]);
const UserRoleEnum = z.enum(["client_user", "engineer", "admin"]);

export const CreateUserSchema = z.object({
  email:     z.string().email().max(255),
  password:  z.string().min(8).max(128),
  fullName:  z.string().min(1).max(120),
  role:      UserRoleEnum,
  companyId: bigIntParam.optional(),
  office:    OfficeEnum.optional(),
});

export const UpdateUserSchema = z
  .object({
    email:     z.string().email().max(255).optional(),
    fullName:  z.string().min(1).max(120).optional(),
    role:      UserRoleEnum.optional(),
    companyId: bigIntParam.nullable().optional(),
    office:    OfficeEnum.nullable().optional(),
    isActive:  z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8).max(128),
});

export const GrantProductAccessSchema = z.object({
  productId: bigIntParam,
});

export type CreateUserInput         = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput         = z.infer<typeof UpdateUserSchema>;
export type ChangePasswordInput     = z.infer<typeof ChangePasswordSchema>;
export type GrantProductAccessInput = z.infer<typeof GrantProductAccessSchema>;
