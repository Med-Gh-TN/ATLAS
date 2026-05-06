import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card — Primary content container.
 *
 * Omni‑Architect v3.0 constraints:
 *   – Radius: rounded‑xl (32 px = 8 × 4) (Apple HIG #7).
 *   – Asymmetric header padding breaks mirror symmetry (AI Anti‑Pattern #9).
 *   – Golden‑ratio hero variant for featured cards (Geometry of Design #2).
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

/**
 * CardHero — Aspect‑ratio‑locked card for featured / dashboard hero uses.
 * Follows golden section (1.618 : 1) as prescribed by Geometry of Design (#2).
 */
const CardHero = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md",
      "aspect-[1.618/1]",
      className,
    )}
    {...props}
  />
));
CardHero.displayName = "CardHero";

/**
 * CardHeader — Top section of a card.
 * Padding breaks symmetry: top 24 px, bottom 16 px (33 % difference).
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 pt-6 pb-4 px-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHero,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};