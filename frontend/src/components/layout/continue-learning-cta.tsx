"use client";

import Link from "next/link";
import { 
  Play, 
  BookOpen, 
  Brain, 
  FileQuestion, 
  MessageSquare, 
  FileText, 
  Map 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useContinueLearning } from "@/hooks/use-continue-learning";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const TOOL_ICONS: Record<string, any> = {
  read: BookOpen,
  flashcards: Brain,
  quiz: FileQuestion,
  chat: MessageSquare,
  summary: FileText,
  mindmap: Map,
};

export function ContinueLearningCTA() {
  const { getContinueLearning } = useContinueLearning();
  const { t } = useTranslation();
  const [state, setState] = useState<ReturnType<typeof getContinueLearning>>(null);

  useEffect(() => {
    // Refresh state on mount and periodically if needed
    setState(getContinueLearning());
  }, [getContinueLearning]);

  if (!state) return null;

  const Icon = (state.toolId && TOOL_ICONS[state.toolId]) || Play;

  return (
    <Button
      asChild
      className="group relative hidden overflow-hidden lg:flex transition-all duration-300 hover:pr-12"
      size="sm"
    >
      <Link href={state.path}>
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 animate-pulse text-primary-foreground" />
          <span className="max-w-[120px] truncate">
            {state.courseTitle}
          </span>
        </span>
        
        <span className="absolute inset-inline-end-0 flex h-full w-24 items-center justify-center bg-primary-foreground/10 opacity-0 transition-all group-hover:opacity-100">
           <span className="text-[10px] font-bold uppercase tracking-wider mr-1">{t("common.resume")}</span>
           <Play className="h-3 w-3 fill-current" />
        </span>
      </Link>
    </Button>
  );
}
