/**
 * @file frontend/src/lib/utils.ts
 * @description Standard Tailwind CSS class merge utility and global formatting helpers.
 * @layer Core Logic
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// 1. Tailwind class merger (shadcn/ui standard)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 2. Role formatting (Fixes the header crash)
export function formatRole(role?: string | null): string {
  if (!role) return "";
  const normalized = role.toUpperCase();
  const labels: Record<string, string> = {
    STUDENT: "Étudiant(e)",
    TEACHER: "Enseignant(e)",
    ADMIN: "Administrateur",
    SUPERADMIN: "Super Admin",
  };
  return labels[normalized] || role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

// 3. Date formatting (Common for dashboard tables/activity logs)
export function formatDate(date: string | Date | null | undefined, locale = "fr-FR"): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

// 4. Initials generation (Common for User Avatars in the header)
export function getInitials(name?: string | null): string {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// 5. File size formatting (Common for course uploads)
export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}