import { z } from 'zod';

// ============================================================================
// ATLAS - Auth Validation Schemas (Zod)
// Author: Mouhamed (Lead FE)
// Description: Centralized validation schemas for all authentication flows.
// Defends against malformed inputs before they ever hit the API.
// ============================================================================

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, { message: "L'adresse email est requise." })
    .email({ message: "Veuillez entrer une adresse email valide." }),
  password: z
    .string()
    .min(1, { message: "Le mot de passe est requis." })
    .min(8, { message: "Le mot de passe doit contenir au moins 8 caractères." }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  firstName: z
    .string()
    .min(2, { message: "Le prénom doit contenir au moins 2 caractères." })
    .max(50, { message: "Le prénom est trop long." }),
  lastName: z
    .string()
    .min(2, { message: "Le nom doit contenir au moins 2 caractères." })
    .max(50, { message: "Le nom est trop long." }),
  email: z
    .string()
    .min(1, { message: "L'adresse email est requise." })
    .email({ message: "Veuillez entrer une adresse email valide." }),
  password: z
    .string()
    .min(8, { message: "Le mot de passe doit contenir au moins 8 caractères." })
    .regex(/[A-Z]/, { message: "Le mot de passe doit contenir au moins une majuscule." })
    .regex(/[0-9]/, { message: "Le mot de passe doit contenir au moins un chiffre." }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const otpSchema = z.object({
  pin: z
    .string()
    .length(6, { message: "Le code OTP doit contenir exactement 6 chiffres." })
    .regex(/^\d+$/, { message: "Le code OTP ne doit contenir que des chiffres." }),
});

export type OtpInput = z.infer<typeof otpSchema>;

export const resetPasswordSchema = z.object({
  email: z
    .string()
    .min(1, { message: "L'adresse email est requise." })
    .email({ message: "Veuillez entrer une adresse email valide." }),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// NEW: Schema for the actual password reset action
export const resetPasswordConfirmSchema = z.object({
  pin: z
    .string()
    .length(6, { message: "Le code OTP doit contenir exactement 6 chiffres." })
    .regex(/^\d+$/, { message: "Le code OTP ne doit contenir que des chiffres." }),
  password: z
    .string()
    .min(8, { message: "Le mot de passe doit contenir au moins 8 caractères." })
    .regex(/[A-Z]/, { message: "Le mot de passe doit contenir au moins une majuscule." })
    .regex(/[0-9]/, { message: "Le mot de passe doit contenir au moins un chiffre." }),
});

export type ResetPasswordConfirmInput = z.infer<typeof resetPasswordConfirmSchema>;