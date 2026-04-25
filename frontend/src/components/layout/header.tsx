"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  CheckCircle,
  ChevronDown,
  Globe,
  GraduationCap,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createNotificationsWebSocket, notificationsApi, searchApi } from "@/lib/api";
import { useRTL, useTheme } from "@/hooks/use-rtl";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Language } from "@/hooks/use-rtl";
import type { AutocompleteResult, Notification } from "@/types/api.types";

interface HeaderProps {
  className?: string;
}

const roleHomes = {
  STUDENT: "/dashboard",
  TEACHER: "/teacher/dashboard",
  ADMIN: "/admin/dashboard",
  SUPERADMIN: "/superadmin",
} as const;

const roleCTAs = {
  STUDENT: { label: "Continue Learning", href: "/courses" },
  TEACHER: { label: "Upload Course", href: "/teacher/courses/upload" },
  ADMIN: { label: "Review Queue", href: "/admin/contributions" },
  SUPERADMIN: { label: "Platform Overview", href: "/superadmin" },
} as const;

const settingsRoutes = {
  STUDENT: "/settings",
  TEACHER: "/teacher/settings",
  ADMIN: "/admin/settings",
  SUPERADMIN: "/superadmin/dashboard",
} as const;

export function Header({ className }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const { lang, setLanguage, languageNames } = useRTL();

  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AutocompleteResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const ws = createNotificationsWebSocket(user.id);
    const unsubscribe = ws.subscribe(`/ws/notifications/${user.id}`, (payload: unknown) => {
      const notification = payload as Notification;
      setNotifications((prev) => [notification, ...prev]);
      if (!notification.is_read) {
        setUnreadCount((prev) => prev + 1);
      }
    });

    return () => {
      unsubscribe();
      ws.disconnect();
    };
  }, [user?.id]);

  useEffect(() => {
    const loadNotifications = async () => {
      if (!user?.id) {
        return;
      }

      try {
        const response = await notificationsApi.list({ limit: 20 });
        const items = response.items || [];
        setNotifications(items);
        setUnreadCount(items.filter((item) => !item.is_read).length);
      } catch (error) {
        console.error("Failed to load notifications:", error);
      }
    };

    void loadNotifications();
  }, [user?.id]);

  const handleSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchApi.autocomplete(query.trim());
      setSearchResults(results);
      setShowSearch(true);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      void handleSearch(searchQuery);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [handleSearch, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (searchRef.current && !searchRef.current.contains(target)) {
        setShowSearch(false);
      }
      if (notifRef.current && !notifRef.current.contains(target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setShowProfile(false);
      }
      if (langRef.current && !langRef.current.contains(target)) {
        setShowLangMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const roleCTA = useMemo(() => {
    if (!user?.role) {
      return null;
    }

    if (user.role === "STUDENT") {
      const lastVisitedCourse =
        typeof window !== "undefined"
          ? window.localStorage.getItem("atlas_last_course_path")
          : null;
      return {
        label: roleCTAs.STUDENT.label,
        href: lastVisitedCourse || roleCTAs.STUDENT.href,
      };
    }

    return roleCTAs[user.role as keyof typeof roleCTAs] ?? null;
  }, [user?.role]);

  const homeHref = user?.role
    ? roleHomes[user.role as keyof typeof roleHomes] || "/"
    : "/";
  const settingsHref = user?.role
    ? settingsRoutes[user.role as keyof typeof settingsRoutes] || "/settings"
    : "/settings";

  const ThemeIcon = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  }[theme];

  const handleSearchSubmit = () => {
    if (!searchQuery.trim()) {
      return;
    }

    const destination =
      user?.role === "STUDENT"
        ? `/ai/workspace?q=${encodeURIComponent(searchQuery.trim())}`
        : `/search?q=${encodeURIComponent(searchQuery.trim())}`;

    router.push(destination);
    setShowSearch(false);
    setSearchQuery("");
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      handleSearchSubmit();
    }

    if (event.key === "Escape") {
      setShowSearch(false);
    }
  };

  const handleResultClick = (result: AutocompleteResult) => {
    if (result.course_id) {
      router.push(`/courses/${result.course_id}`);
    } else {
      router.push(`/search?q=${encodeURIComponent(result.title)}`);
    }
    setShowSearch(false);
    setSearchQuery("");
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationsApi.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notificationId ? { ...item, is_read: true } : item,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const unread = notifications.filter((item) => !item.is_read);
      await Promise.all(unread.map((item) => notificationsApi.markAsRead(item.id)));
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark notifications as read:", error);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/auth/login");
  };

  const handleLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setShowLangMenu(false);
  };

  if (!mounted) {
    return (
      <header
        className={cn(
          "sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
          className,
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 lg:px-6">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-96" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className,
      )}
    >
      <div className="flex h-16 items-center justify-between px-4 lg:px-6">
        <Link href={homeHref} className="flex items-center gap-2">
          <GraduationCap className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold">ATLAS</span>
        </Link>

        <div ref={searchRef} className="relative mx-8 hidden max-w-xl flex-1 md:flex">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search courses, ask anything..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => searchQuery.length >= 2 && setShowSearch(true)}
              className="w-full pl-10 pr-20"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <kbd className="hidden h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground lg:inline-flex">
                  <span className="text-xs">Cmd</span>K
                </kbd>
              )}
            </div>
          </div>

          {showSearch && (
            <div className="absolute left-0 right-0 top-full mt-2 max-h-96 overflow-y-auto rounded-lg border bg-background shadow-lg">
              {searchResults.length > 0 ? (
                <div className="p-2">
                  <div className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                    Courses
                  </div>
                  {searchResults.map((result) => (
                    <button
                      key={`${result.course_id}-${result.title}`}
                      onClick={() => handleResultClick(result)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted"
                    >
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate text-left">{result.title}</span>
                      <span className="text-xs text-muted-foreground">{result.type}</span>
                    </button>
                  ))}
                  <div className="my-2 border-t" />
                  <button
                    onClick={handleSearchSubmit}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-primary hover:bg-muted"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Ask AI about &quot;{searchQuery}&quot;</span>
                  </button>
                </div>
              ) : searchQuery.length >= 2 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No results found
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {roleCTA && (
            <Button asChild className="hidden lg:flex">
              <Link href={roleCTA.href}>{roleCTA.label}</Link>
            </Button>
          )}

          <button
            onClick={() =>
              setTheme(
                theme === "light" ? "dark" : theme === "dark" ? "system" : "light",
              )
            }
            className="rounded-lg p-2 transition-colors hover:bg-muted"
            aria-label="Toggle theme"
          >
            <ThemeIcon className="h-5 w-5" />
          </button>

          <div ref={langRef} className="relative">
            <button
              onClick={() => setShowLangMenu((current) => !current)}
              className="rounded-lg p-2 transition-colors hover:bg-muted"
              aria-label="Change language"
            >
              <Globe className="h-5 w-5" />
            </button>

            {showLangMenu && (
              <div className="absolute right-0 top-full mt-2 w-40 rounded-lg border bg-background py-1 shadow-lg">
                {(["fr", "ar", "en"] as Language[]).map((language) => (
                  <button
                    key={language}
                    onClick={() => handleLanguageChange(language)}
                    className={cn(
                      "flex w-full items-center justify-between px-4 py-2 text-sm hover:bg-muted",
                      lang === language && "bg-muted",
                    )}
                  >
                    <span>{language.toUpperCase()}</span>
                    <span className="text-muted-foreground">{languageNames[language]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div ref={notifRef} className="relative">
            <button
              onClick={() => setShowNotifications((current) => !current)}
              className="relative rounded-lg p-2 transition-colors hover:bg-muted"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-background shadow-lg">
                <div className="flex items-center justify-between border-b p-4">
                  <h3 className="font-semibold">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-primary hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        className={cn(
                          "block w-full border-b p-4 text-left last:border-b-0 hover:bg-muted/50",
                          !notification.is_read && "bg-primary/5",
                        )}
                        onClick={() =>
                          !notification.is_read && handleMarkAsRead(notification.id)
                        }
                      >
                        <p className="text-sm font-medium">{notification.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {notification.message}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(notification.created_at).toLocaleDateString()}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <CheckCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        You are all caught up
                      </p>
                    </div>
                  )}
                </div>
                <div className="border-t p-2">
                  <Button asChild variant="ghost" className="w-full" size="sm">
                    <Link href="/notifications">View all notifications</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div ref={profileRef} className="relative">
            <button
              onClick={() => setShowProfile((current) => !current)}
              className="flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-muted"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                {user?.full_name?.charAt(0) || user?.email?.charAt(0) || "U"}
              </div>
              <ChevronDown className="hidden h-4 w-4 text-muted-foreground md:block" />
            </button>

            {showProfile && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border bg-background py-1 shadow-lg">
                <div className="border-b px-4 py-3">
                  <p className="font-medium">{user?.full_name || "User"}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                  <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {user?.role}
                  </span>
                </div>
                <Link
                  href={settingsHref}
                  className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                {user?.role === "STUDENT" && (
                  <Link
                    href={pathname === "/profile" ? "/profile" : "/profile"}
                    className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted"
                  >
                    <User className="h-4 w-4" />
                    Profile
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-destructive hover:bg-muted"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-3 md:hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search courses, ask anything..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full pl-10"
          />
        </div>
      </div>
    </header>
  );
}
