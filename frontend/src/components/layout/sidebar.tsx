"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  BookOpen,
  Upload,
  User,
  LogOut,
  Menu,
  X,
  Bell,
  Trophy,
  Settings,
  GraduationCap,
  Users,
  BarChart3,
  Building2,
  FileText,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { useState } from "react";

type Role = "STUDENT" | "TEACHER" | "ADMIN" | "SUPERADMIN";

const studentNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Search", href: "/search", icon: Search },
  { name: "Study", href: "/study", icon: BookOpen },
  { name: "Upload", href: "/upload", icon: Upload },
  { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
];

const teacherNavigation = [
  { name: "Dashboard", href: "/teacher/dashboard", icon: LayoutDashboard },
  { name: "Manage Courses", href: "/teacher/manage-courses", icon: BookOpen },
  {
    name: "Contributions",
    href: "/teacher/manage-contributions",
    icon: CheckCircle,
  },
  { name: "Analytics", href: "/teacher/analytics", icon: BarChart3 },
];

const adminNavigation = [
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Courses", href: "/admin/courses", icon: BookOpen },
  { name: "Reports", href: "/admin/reports", icon: FileText },
];

const superadminNavigation = [
  { name: "Dashboard", href: "/superadmin/dashboard", icon: LayoutDashboard },
  {
    name: "Establishments",
    href: "/superadmin/establishments",
    icon: Building2,
  },
];

const baseNavigation: Record<
  Role,
  { name: string; href: string; icon: typeof LayoutDashboard }[]
> = {
  STUDENT: studentNavigation,
  TEACHER: teacherNavigation,
  ADMIN: adminNavigation,
  SUPERADMIN: superadminNavigation,
};

const sectionTitles: Record<Role, string> = {
  STUDENT: "My Learning",
  TEACHER: "Teaching",
  ADMIN: "Management",
  SUPERADMIN: "Superadmin",
};

const studentSectionItems = [
  { name: "My Flashcards", href: "/my/flashcards", icon: BookOpen },
  { name: "Contributions", href: "/my/contributions", icon: Upload },
  { name: "History", href: "/my/history", icon: Settings },
];

interface SidebarProps {
  role: Role;
}

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isStudent = role === "STUDENT";
  const isTeacher = role === "TEACHER";
  const isAdmin = role === "ADMIN";

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="fixed left-4 top-4 z-50 lg:hidden"
      >
        {mobileMenuOpen ? <X /> : <Menu />}
      </button>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform bg-sidebar-background transition-transform duration-200 ease-in-out lg:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-6">
            <Link
              href={
                role === "STUDENT"
                  ? "/dashboard"
                  : `/${role.toLowerCase()}/dashboard`
              }
              className="flex items-center gap-2"
            >
              <GraduationCap className="h-8 w-8 text-white" />
              <span className="text-xl font-bold text-white">ATLAS</span>
            </Link>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-4">
            {baseNavigation[role].map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}

            {isStudent && (
              <>
                <div className="py-4">
                  <div className="border-t border-sidebar-border" />
                </div>
                <p className="px-3 text-xs font-semibold uppercase text-sidebar-foreground/50">
                  {sectionTitles[role]}
                </p>
                {studentSectionItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                      )}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Icon className="h-5 w-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </>
            )}
          </nav>

          <div className="border-t border-sidebar-border p-4">
            <div className="space-y-2">
              <Link
                href="/notifications"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50"
              >
                <Bell className="h-5 w-5" />
                Notifications
              </Link>
              {(isTeacher || isAdmin) && (
                <Link
                  href={`/${role.toLowerCase()}/settings`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50"
                >
                  <Settings className="h-5 w-5" />
                  Settings
                </Link>
              )}
              {isStudent && (
                <Link
                  href="/profile"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50"
                >
                  <User className="h-5 w-5" />
                  Profile
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50"
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </>
  );
}
