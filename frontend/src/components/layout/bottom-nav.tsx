"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  BookOpen,
  Upload,
  User,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";

const studentNavItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/study", icon: BookOpen, label: "Study" },
  { href: "/notifications", icon: Bell, label: "Alerts" },
  { href: "/profile", icon: User, label: "Profile" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const isTeacher = user?.role === "TEACHER" || user?.role === "ADMIN";

  const navItems = isTeacher
    ? [
        { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
        { href: "/search", icon: Search, label: "Search" },
        { href: "/upload", icon: Upload, label: "Upload" },
        { href: "/notifications", icon: Bell, label: "Alerts" },
        { href: "/profile", icon: User, label: "Profile" },
      ]
    : studentNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background lg:hidden">
      <div className="flex h-16 items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-2 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
