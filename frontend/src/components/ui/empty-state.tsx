import {
  FileQuestion,
  Search,
  Inbox,
  AlertCircle,
  BookOpen,
  Users,
  Upload,
  MessageSquare,
  Layers,
  GitBranch,
  FileText,
  BarChart3,
  Clock,
  Map,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type EmptyStateType =
  | "no-results"
  | "no-data"
  | "no-contributions"
  | "no-notifications"
  | "no-courses"
  | "no-students"
  | "no-badges"
  | "error"
  | "custom"
  | "chat"
  | "flashcards"
  | "forum"
  | "mindmap"
  | "quiz"
  | "reader"
  | "summary"
  | "search"
  | "history"
  | "not-found"
  | "contributions"
  | "notifications";

interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  description?: string;
  icon?: React.ElementType;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const emptyStateConfig: Record<
  EmptyStateType,
  { icon: React.ElementType; title: string; description: string }
> = {
  "no-results": {
    icon: Search,
    title: "No results found",
    description:
      "Try adjusting your search or filters to find what you're looking for.",
  },
  "no-data": {
    icon: Inbox,
    title: "No data yet",
    description: "Data will appear here once it's available.",
  },
  "no-contributions": {
    icon: Upload,
    title: "No contributions yet",
    description: "Upload your first document to get started.",
  },
  "no-notifications": {
    icon: AlertCircle,
    title: "All caught up!",
    description: "You have no new notifications at the moment.",
  },
  "no-courses": {
    icon: BookOpen,
    title: "No courses available",
    description:
      "Courses will appear here once they're added by administrators.",
  },
  "no-students": {
    icon: Users,
    title: "No students enrolled",
    description: "Students will appear here once they enroll in your courses.",
  },
  "no-badges": {
    icon: FileQuestion,
    title: "No badges earned",
    description: "Complete tasks and challenges to earn badges.",
  },
  error: {
    icon: AlertCircle,
    title: "Something went wrong",
    description: "An error occurred. Please try again later.",
  },
  custom: {
    icon: Inbox,
    title: "Nothing here",
    description: "",
  },
  chat: {
    icon: MessageSquare,
    title: "Start a conversation",
    description:
      "Ask questions about the course content and get AI-powered answers.",
  },
  flashcards: {
    icon: Layers,
    title: "No flashcards yet",
    description: "Flashcards will appear here once they're generated or added.",
  },
  forum: {
    icon: MessageSquare,
    title: "No discussions yet",
    description: "Start a discussion or wait for others to post.",
  },
  mindmap: {
    icon: GitBranch,
    title: "Mind map not generated",
    description: "Generate a mind map to visualize the course structure.",
  },
  quiz: {
    icon: FileQuestion,
    title: "No quiz available",
    description: "Quizzes will be available once the teacher creates them.",
  },
  reader: {
    icon: FileText,
    title: "No documents available",
    description: "Course materials will appear here once uploaded.",
  },
  summary: {
    icon: BarChart3,
    title: "Summary not available",
    description: "An AI summary will be generated when content is available.",
  },
  search: {
    icon: Search,
    title: "Search for anything",
    description: "Enter a search term to find courses, topics, or content.",
  },
  history: {
    icon: Clock,
    title: "No study history",
    description: "Your study history will appear here as you learn.",
  },
  "not-found": {
    icon: FileQuestion,
    title: "Not found",
    description: "The requested content could not be found.",
  },
  contributions: {
    icon: Upload,
    title: "No contributions",
    description: "You haven't made any contributions yet.",
  },
  notifications: {
    icon: AlertCircle,
    title: "No notifications",
    description: "You're all caught up!",
  },
};

export function EmptyState({
  type = "no-data",
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  const config = emptyStateConfig[type];
  const IconComponent = icon ? (icon as React.ElementType) : config.icon;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className,
      )}
    >
      <div className="rounded-full bg-muted p-4 mb-6">
        {typeof IconComponent === "function" ? (
          <IconComponent className="h-12 w-12 text-muted-foreground" />
        ) : (
          <span className="h-12 w-12 text-muted-foreground">
            {IconComponent}
          </span>
        )}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title || config.title}</h3>
      <p className="text-muted-foreground max-w-md mb-6">
        {description || config.description}
      </p>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}
