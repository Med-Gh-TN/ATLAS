import { cn } from "@/lib/utils";

type StatusType =
  | "pending"
  | "processing"
  | "ready"
  | "approved"
  | "rejected"
  | "active"
  | "inactive"
  | "success"
  | "warning"
  | "error"
  | "info";

interface StatusChipProps {
  status: string;
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

function normalizeStatus(status: string): StatusType {
  const normalized = status.toLowerCase();
  const validStatuses: StatusType[] = [
    "pending",
    "processing",
    "ready",
    "approved",
    "rejected",
    "active",
    "inactive",
    "success",
    "warning",
    "error",
    "info",
  ];
  if (validStatuses.includes(normalized as StatusType)) {
    return normalized as StatusType;
  }
  const statusMap: Record<string, StatusType> = {
    PENDING: "pending",
    PROCESSING: "processing",
    READY: "ready",
    APPROVED: "approved",
    REJECTED: "rejected",
    ACTIVE: "active",
    INACTIVE: "inactive",
    QUEUED: "pending",
    FAILED: "error",
    SUCCESS: "success",
    WARNING: "warning",
    INFO: "info",
  };
  return statusMap[status.toUpperCase()] || "info";
}

const statusConfig: Record<
  StatusType,
  { bg: string; text: string; dot: string; label: string }
> = {
  pending: {
    bg: "bg-amber-50 dark:bg-amber-950",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    label: "Pending",
  },
  processing: {
    bg: "bg-blue-50 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500 animate-pulse",
    label: "Processing",
  },
  ready: {
    bg: "bg-emerald-50 dark:bg-emerald-950",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    label: "Ready",
  },
  approved: {
    bg: "bg-green-50 dark:bg-green-950",
    text: "text-green-700 dark:text-green-300",
    dot: "bg-green-500",
    label: "Approved",
  },
  rejected: {
    bg: "bg-red-50 dark:bg-red-950",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
    label: "Rejected",
  },
  active: {
    bg: "bg-green-50 dark:bg-green-950",
    text: "text-green-700 dark:text-green-300",
    dot: "bg-green-500",
    label: "Active",
  },
  inactive: {
    bg: "bg-gray-50 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
    dot: "bg-gray-400",
    label: "Inactive",
  },
  success: {
    bg: "bg-green-50 dark:bg-green-950",
    text: "text-green-700 dark:text-green-300",
    dot: "bg-green-500",
    label: "Success",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-950",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    label: "Warning",
  },
  error: {
    bg: "bg-red-50 dark:bg-red-950",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
    label: "Error",
  },
  info: {
    bg: "bg-blue-50 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
    label: "Info",
  },
};

export function StatusChip({
  status,
  label,
  className,
  size = "md",
}: StatusChipProps) {
  const normalizedStatus = normalizeStatus(status);
  const config = statusConfig[normalizedStatus];
  const displayLabel = label || config.label;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-2.5 py-1 text-xs gap-1.5",
    lg: "px-3 py-1.5 text-sm gap-2",
  };

  const dotSizes = {
    sm: "h-1.5 w-1.5",
    md: "h-2 w-2",
    lg: "h-2.5 w-2.5",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        config.bg,
        config.text,
        sizeClasses[size],
        className,
      )}
    >
      <span className={cn("rounded-full", config.dot, dotSizes[size])} />
      {displayLabel}
    </span>
  );
}

export function mapContributionStatus(status: string): StatusType {
  const statusMap: Record<string, StatusType> = {
    PENDING: "pending",
    PROCESSING: "processing",
    READY: "ready",
    APPROVED: "approved",
    REJECTED: "rejected",
    ACTIVE: "active",
    INACTIVE: "inactive",
  };
  return statusMap[status.toUpperCase()] || "info";
}

export function mapPipelineStatus(status: string): StatusType {
  const statusMap: Record<string, StatusType> = {
    QUEUED: "pending",
    PROCESSING: "processing",
    READY: "ready",
    FAILED: "error",
  };
  return statusMap[status.toUpperCase()] || "info";
}
