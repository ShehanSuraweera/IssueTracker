import { z } from "zod";

// ─── Shared primitives ────────────────────────────────────────────────────────

export const emailField = z.string().email("Enter a valid email");

export const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[A-Z]/, "Must contain at least one uppercase letter")
  .regex(/[0-9]/, "Must contain at least one digit");

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email:    emailField,
  password: z.string().min(1, "Password is required"),
});

export const requestAccessSchema = z
  .object({
    fullName:        z.string().min(2, "Full name must be at least 2 characters").max(120),
    email:           emailField,
    companyName:     z.string().min(2, "Company name must be at least 2 characters").max(120),
    password:        passwordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path:    ["confirmPassword"],
  });

// ─── Settings ─────────────────────────────────────────────────────────────────

export const profileSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(120),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword:     passwordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path:    ["confirmPassword"],
  });

// ─── Inferred types ───────────────────────────────────────────────────────────

export type LoginFormValues          = z.infer<typeof loginSchema>;
export type RequestAccessFormValues  = z.infer<typeof requestAccessSchema>;
export type ProfileFormValues        = z.infer<typeof profileSchema>;
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
