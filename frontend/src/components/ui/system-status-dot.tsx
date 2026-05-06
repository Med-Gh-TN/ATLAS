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
  pulse = true,
  className,
}: {
  status: SystemStatus;
  showLabel?: boolean;
  size?: "sm" | "md";
  pulse?: boolean;
  className?: string;
}) {
  const sizeClass = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex items-center justify-center">
        {pulse && status === "operational" && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              palette[status],
            )}
          />
        )}
        <span
          className={cn("relative inline-flex rounded-full", sizeClass, palette[status])}
        />
      </div>
      {showLabel ? (
        <span className="text-sm font-medium text-muted-foreground">
          {status === "operational"
            ? "All Systems Operational"
            : status === "degraded"
              ? "System Degraded"
              : "System Outage"}
        </span>
      ) : null}
    </div>
  );
}
