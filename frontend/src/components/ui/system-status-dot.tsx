import { cn } from "@/lib/utils";

type SystemStatus = "operational" | "degraded" | "outage";

const palette: Record<SystemStatus, string> = {
  operational: "bg-atlas-success",
  degraded: "bg-atlas-warning",
  outage: "bg-atlas-danger",
};

export function SystemStatusDot({
  status,
  showLabel = true,
  size = "sm",
  className,
}: {
  status: SystemStatus;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const sizeClass = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className={cn("inline-flex rounded-full", sizeClass, palette[status])}
      />
      {showLabel ? (
        <span className="text-sm capitalize text-muted-foreground">
          {status}
        </span>
      ) : null}
    </div>
  );
}
