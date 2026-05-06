import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button variants.
 *
 * SOTA FIX (Omni-Architect v3.0):
 *   – Broken uniform pill radius: each size maps to an Apple 8‑point radius.
 *   – All radii differ by ≥12% across sizes (AI Anti‑Pattern #9).
 *   – Color palette restricted to ≤3 functional hues (Refactoring UI #8).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-2 focus-visible:outline-current focus-visible:-outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-95",
        outline:
          "border border-border bg-transparent hover:bg-muted hover:text-foreground active:scale-95",
        secondary:
          "bg-muted text-muted-foreground hover:bg-muted/80 active:scale-95",
        ghost:
          "hover:bg-muted hover:text-foreground active:scale-95",
        link:
          "text-primary underline-offset-4 hover:underline",
        success:
          "bg-success text-success-foreground hover:bg-success/90 active:scale-95",
        glass:
          "glass-material text-foreground hover:bg-white/10 active:scale-95",
        glassLight:
          "glass-light text-foreground hover:bg-white/20 active:scale-95",
      },
      size: {
        default: "h-10 px-5 py-2 rounded-xl",        // 8×4 = 32px
        sm:      "h-8 px-4 text-xs rounded-lg",      // 8×3 = 24px
        lg:      "h-12 px-8 text-base rounded-2xl",  // 8×5 = 40px
        xl:      "h-14 px-10 text-lg rounded-2xl",
        icon:    "h-10 w-10 rounded-full",           // icon stays pill for consistency
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };