import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
};

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, size = "md", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full",
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Avatar.displayName = "Avatar";

type AvatarImageProps = Omit<
  React.ComponentProps<typeof Image>,
  "src" | "alt" | "fill"
> & {
  src?: string;
  alt?: string;
};

const AvatarImage = ({ className, src, alt, ...props }: AvatarImageProps) => {
  if (!src) return null;
  return (
    <div className={cn("relative h-full w-full", className)}>
      <Image
        src={src}
        alt={alt || "Avatar"}
        fill
        className="aspect-square object-cover"
        sizes="100vw"
        {...props}
      />
    </div>
  );
};
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted font-medium",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback };
