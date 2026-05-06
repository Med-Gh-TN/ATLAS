"use client";

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface OnboardingStepProps {
  step: {
    id: number;
    title: string;
    description: string;
    icon: LucideIcon;
  };
  isActive: boolean;
  isCompleted: boolean;
  className?: string;
}

export function OnboardingStep({
  step,
  isActive,
  isCompleted,
  className,
}: OnboardingStepProps) {
  const Icon = step.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg transition-all",
        isActive && "bg-primary/10 border border-primary/20",
        isCompleted && "bg-green-500/10",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full transition-colors",
          isActive && "bg-primary text-primary-foreground",
          isCompleted && "bg-green-500 text-white",
          !isActive && !isCompleted && "bg-muted text-muted-foreground",
        )}
      >
        {isCompleted ? (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <Icon className="w-5 h-5" />
        )}
      </div>
      <div className="flex-1">
        <h3
          className={cn(
            "font-medium text-sm",
            !isActive && !isCompleted && "text-muted-foreground",
          )}
        >
          {step.title}
        </h3>
        <p className="text-xs text-muted-foreground">{step.description}</p>
      </div>
    </div>
  );
}
