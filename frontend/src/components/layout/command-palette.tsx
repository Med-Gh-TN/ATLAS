"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Command as CommandRoot,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "cmdk";
import {
  BookOpen,
  Brain,
  Clock,
  FileQuestion,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Layers,
  LogOut,
  MessageSquare,
  Search,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

interface Command {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  action: () => void;
  group: "navigation" | "actions" | "recent";
  roles?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [query, setQuery] = useState("");

  const recentCourses =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("atlas_recent_courses") || "[]").slice(
          0,
          5,
        )
      : [];

  const commands: Command[] = [
    {
      id: "nav-dashboard",
      label: "Go to Dashboard",
      icon: LayoutDashboard,
      action: () => {
        router.push(
          user?.role === "STUDENT"
            ? "/dashboard"
            : `/${user?.role?.toLowerCase()}/dashboard`,
        );
        onOpenChange(false);
      },
      group: "navigation",
    },
    {
      id: "nav-search",
      label: "Go to Search",
      icon: Search,
      action: () => {
        router.push("/search");
        onOpenChange(false);
      },
      group: "navigation",
    },
    {
      id: "nav-flashcards",
      label: "Go to My Flashcards",
      icon: Layers,
      action: () => {
        router.push("/my/flashcards");
        onOpenChange(false);
      },
      group: "navigation",
    },
    {
      id: "nav-forum",
      label: "Go to Forum",
      icon: MessageSquare,
      action: () => {
        router.push("/forum");
        onOpenChange(false);
      },
      group: "navigation",
    },
    {
      id: "nav-leaderboard",
      label: "Go to Leaderboard",
      icon: GraduationCap,
      action: () => {
        router.push("/leaderboard");
        onOpenChange(false);
      },
      group: "navigation",
    },
    {
      id: "action-quiz",
      label: "Start New Quiz",
      icon: FileQuestion,
      action: () => {
        router.push("/ai/workspace?tab=quiz");
        onOpenChange(false);
      },
      group: "actions",
    },
    {
      id: "action-flashcards",
      label: "Generate Flashcard Deck",
      icon: Brain,
      action: () => {
        router.push("/ai/workspace?tab=flashcards");
        onOpenChange(false);
      },
      group: "actions",
    },
    {
      id: "action-chat",
      label: "Open AI Chat",
      icon: MessageSquare,
      action: () => {
        router.push("/ai/workspace?tab=chat");
        onOpenChange(false);
      },
      group: "actions",
    },
    {
      id: "action-upload",
      label: "Upload Course",
      icon: Upload,
      action: () => {
        router.push("/teacher/courses/upload");
        onOpenChange(false);
      },
      group: "actions",
      roles: ["TEACHER", "ADMIN", "SUPERADMIN"],
    },
    {
      id: "action-contributions",
      label: "Review Contributions",
      icon: FolderKanban,
      action: () => {
        router.push("/admin/contributions");
        onOpenChange(false);
      },
      group: "actions",
      roles: ["ADMIN", "SUPERADMIN"],
    },
    {
      id: "action-users",
      label: "Manage Users",
      icon: Users,
      action: () => {
        router.push("/admin/users");
        onOpenChange(false);
      },
      group: "actions",
      roles: ["ADMIN", "SUPERADMIN"],
    },
    {
      id: "nav-settings",
      label: "Go to Settings",
      icon: Settings,
      action: () => {
        router.push("/settings");
        onOpenChange(false);
      },
      group: "navigation",
    },
    {
      id: "action-logout",
      label: "Logout",
      icon: LogOut,
      action: async () => {
        await logout();
        router.push("/auth/login");
        onOpenChange(false);
      },
      group: "actions",
    },
  ];

  const filteredCommands = useMemo(
    () =>
      commands.filter((cmd) => {
        if (cmd.roles && user?.role && !cmd.roles.includes(user.role)) {
          return false;
        }
        return cmd.label.toLowerCase().includes(query.toLowerCase());
      }),
    [commands, query, user?.role],
  );

  const groupedCommands = useMemo(
    () => ({
      navigation: filteredCommands.filter((c) => c.group === "navigation"),
      actions: filteredCommands.filter((c) => c.group === "actions"),
      recent: recentCourses
        .map((course: { id: string; title: string }) => ({
          id: `recent-${course.id}`,
          label: course.title,
          icon: BookOpen,
          action: () => {
            router.push(`/courses/${course.id}`);
            onOpenChange(false);
          },
          group: "recent" as const,
        }))
        .filter((c: Command) =>
          c.label.toLowerCase().includes(query.toLowerCase()),
        ),
    }),
    [filteredCommands, onOpenChange, query, recentCourses, router],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      label="ATLAS command palette"
      className="fixed left-1/2 top-[18%] z-50 w-full max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl border bg-background shadow-2xl"
    >
      <CommandRoot className="flex h-full w-full flex-col">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground" />
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
            ESC
          </kbd>
        </div>

        <CommandList className="max-h-96 overflow-y-auto p-2">
          <CommandEmpty className="px-3 py-8 text-center text-sm text-muted-foreground">
            No commands found
          </CommandEmpty>

          {groupedCommands.navigation.length > 0 ? (
            <CommandGroup heading="Navigation">
              {groupedCommands.navigation.map((cmd) => {
                const Icon = cmd.icon;
                return (
                  <CommandItem
                    key={cmd.id}
                    value={cmd.label}
                    onSelect={cmd.action}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-muted"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{cmd.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {groupedCommands.actions.length > 0 ? (
            <>
              <CommandSeparator className="my-2 h-px bg-border" />
              <CommandGroup heading="Actions">
                {groupedCommands.actions.map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <CommandItem
                      key={cmd.id}
                      value={cmd.label}
                      onSelect={cmd.action}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-muted"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{cmd.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          ) : null}

          {groupedCommands.recent.length > 0 ? (
            <>
              <CommandSeparator className="my-2 h-px bg-border" />
              <CommandGroup heading="Recent">
                {groupedCommands.recent.map((cmd: Command) => (
                  <CommandItem
                    key={cmd.id}
                    value={cmd.label}
                    onSelect={cmd.action}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-muted"
                  >
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{cmd.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </CommandRoot>
    </CommandDialog>
  );
}
