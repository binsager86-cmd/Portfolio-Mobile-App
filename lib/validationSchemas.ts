/**
 * Zod validation schemas for authentication forms.
 *
 * Used with react-hook-form via @hookform/resolvers/zod.
 * Centralized here so login, register, and password-change
 * share identical constraints.
 */

import { z } from "zod";

// ── Login Schema ────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .max(200, "Email cannot exceed 200 characters")
    .trim(),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password cannot exceed 128 characters"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// ── Register Schema ─────────────────────────────────────────────────

export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, "Email is required")
      .email("Please enter a valid email address")
      .max(200, "Email cannot exceed 200 characters")
      .trim(),
    displayName: z
      .string()
      .max(100, "Display name cannot exceed 100 characters")
      .trim()
      .optional()
      .or(z.literal("")),
    password: z
      .string()
      .min(1, "Password is required")
      .min(6, "Password must be at least 6 characters")
      .max(128, "Password cannot exceed 128 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

// ── Change Password Schema ──────────────────────────────────────────

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(6, "New password must be at least 6 characters")
      .max(128, "Password cannot exceed 128 characters"),
    confirmNewPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords do not match",
    path: ["confirmNewPassword"],
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
