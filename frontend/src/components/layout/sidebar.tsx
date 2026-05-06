/**
 * @file frontend/src/components/layout/sidebar.tsx
 * @description Master navigation sidebar with glass‑material transparency,
 *              consistent active states, and grid‑aligned spacing.
 *
 *   Omni‑Architect v3.0 constraints:
 *   – Glass‑material transparency (Apple HIG #7).
 *   – Active state uses weight + accent, not colour alone (Norman #3).
 *   – Spacing follows 4‑px grid (Grid Systems #1).
 *   – Two‑colour palette: foreground + primary accent (Refactoring UI #8).
 *
 * @layer Core Logic / UI
 * @dependencies ["next/link","next/navigation","lucide‑react","@/lib/utils","@/store/auth.store","@/hooks/use‑translation"]
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  BookOpen,
  Upload,
  LogOut,
  GraduationCap,
  Users,
  BarChart3,
  FileText,
  CheckCircle,
  Building2,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore, useUIStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/use-translation";

type Role = "STUDENT" | "TEACHER" | "ADMIN" | "SUPERADMIN";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { t, tSection } = useTranslation();
  const sidebarT = tSection("sidebar");

  const studentNavigation = [
    { name: sidebarT.dashboard || "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: sidebarT.search || "Search", href: "/search", icon: Search },
    { name: sidebarT.courses || "Courses", href: "/courses", icon: BookOpen },
  ];

  const teacherNavigation = [
    { name: sidebarT.dashboard || "Dashboard", href: "/teacher/dashboard", icon: LayoutDashboard },
    { name: sidebarT.manageCourses || "Courses", href: "/teacher/manage-courses", icon: BookOpen },
    { name: sidebarT.contributions || "Contributions", href: "/teacher/manage-contributions", icon: CheckCircle },
    { name: sidebarT.analytics || "Analytics", href: "/teacher/analytics", icon: BarChart3 },
  ];

  const adminNavigation = [
    { name: sidebarT.dashboard || "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: sidebarT.academicSetup || "Setup", href: "/admin/setup", icon: Building2 },
    { name: sidebarT.users || "Users", href: "/admin/users", icon: Users },
    { name: sidebarT.teacherImport || "Import", href: "/admin/teachers/import", icon: FileText },
  ];

  const superadminNavigation = [
    { name: sidebarT.dashboard || "Dashboard", href: "/superadmin/dashboard", icon: LayoutDashboard },
    { name: sidebarT.establishments || "Establishments", href: "/superadmin/establishments", icon: Building2 },
    { name: sidebarT.admins || "Admins", href: "/superadmin/admins", icon: Users },
    { name: sidebarT.reports || "Reports", href: "/superadmin/reports", icon: ShieldAlert },
  ];

  const baseNavigation: Record<Role, { name: string; href: string; icon: typeof LayoutDashboard }[]> = {
    STUDENT: studentNavigation,
    TEACHER: teacherNavigation,
    ADMIN: adminNavigation,
    SUPERADMIN: superadminNavigation,
  };

  const studentSectionItems = [
    // ❌ Removed "My Flashcards" – now accessed directly from course pages
    { name: sidebarT.contributions || "My Contributions", href: "/my/contributions", icon: Upload },
  ];

  const handleLogout = async () => {
    await logout();
  };

  const navigation =
    role === "STUDENT"
      ? studentNavigation.map((item) =>
          item.href === "/upload"
            ? {
                ...item,
                name: user?.is_contributor
                  ? sidebarT.upload || "Upload"
                  : sidebarT.contributorAccess || "Become Contributor",
              }
            : item,
        )
      : baseNavigation[role];

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col transform border-r transition-all duration-300 ease-in-out",
          // Glass‑material transparency (Apple HIG #7)
          "bg-card/80 backdrop-blur-md",
          sidebarOpen ? "w-64 translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-20",
        )}
      >
        <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden">
          {/* Logo / Brand */}
          <div className={cn("flex h-16 items-center shrink-0", sidebarOpen ? "px-6" : "lg:justify-center px-6")}>
            <Link
              href={role === "STUDENT" ? "/dashboard" : `/${role.toLowerCase()}/dashboard`}
              className="flex items-center gap-2"
            >
              <GraduationCap className="h-8 w-8 text-primary shrink-0" />
              <span
                className={cn(
                  "text-xl font-bold text-foreground transition-opacity duration-200",
                  !sidebarOpen && "lg:hidden",
                )}
              >
                ATLAS
              </span>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center rounded-md py-2.5 text-sm font-medium transition-all duration-200",
                    sidebarOpen ? "gap-3 px-4" : "lg:justify-center gap-3 px-4 lg:px-0",
                    // Active state: heavier weight + accent background (Norman #3)
                    isActive
                      ? "bg-primary/10 text-primary font-semibold shadow-sm"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground",
                  )}
                  title={!sidebarOpen ? item.name : undefined}
                >
                  <Icon className={cn("shrink-0", sidebarOpen ? "h-5 w-5" : "h-5 w-5 lg:h-6 lg:w-6")} />
                  <span className={cn("whitespace-nowrap transition-opacity duration-200", !sidebarOpen && "lg:hidden")}>
                    {item.name}
                  </span>
                </Link>
              );
            })}

            {/* Student "My Learning" section */}
            {role === "STUDENT" && (
              <>
                <div className="py-4">
                  <div className="border-t border-border" />
                </div>
                <p className={cn("px-4 text-xs font-semibold uppercase text-muted-foreground transition-opacity duration-200", !sidebarOpen && "lg:hidden")}>
                  {sidebarT.myLearning || "My Learning"}
                </p>
                {studentSectionItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center rounded-md py-2.5 text-sm font-medium transition-all duration-200 mt-1",
                        sidebarOpen ? "gap-3 px-4" : "lg:justify-center gap-3 px-4 lg:px-0",
                        isActive
                          ? "bg-primary/10 text-primary font-semibold shadow-sm"
                          : "text-foreground/70 hover:bg-muted hover:text-foreground",
                      )}
                      title={!sidebarOpen ? item.name : undefined}
                    >
                      <Icon className={cn("shrink-0", sidebarOpen ? "h-5 w-5" : "h-5 w-5 lg:h-6 lg:w-6")} />
                      <span className={cn("whitespace-nowrap transition-opacity duration-200", !sidebarOpen && "lg:hidden")}>
                        {item.name}
                      </span>
                    </Link>
                  );
                })}
              </>
            )}

            {role === "TEACHER" && (
              <>
                <div className="py-4">
                  <div className="border-t border-border" />
                </div>
                <p className={cn("px-4 text-xs font-semibold uppercase text-muted-foreground transition-opacity duration-200", !sidebarOpen && "lg:hidden")}>
                  {sidebarT.teaching || "Teaching"}
                </p>
              </>
            )}
            {role === "ADMIN" && (
              <>
                <div className="py-4">
                  <div className="border-t border-border" />
                </div>
                <p className={cn("px-4 text-xs font-semibold uppercase text-muted-foreground transition-opacity duration-200", !sidebarOpen && "lg:hidden")}>
                  {sidebarT.management || "Management"}
                </p>
              </>
            )}
            {role === "SUPERADMIN" && (
              <>
                <div className="py-4">
                  <div className="border-t border-border" />
                </div>
                <p className={cn("px-4 text-xs font-semibold uppercase text-muted-foreground transition-opacity duration-200", !sidebarOpen && "lg:hidden")}>
                  {sidebarT.superadmin || "Superadmin"}
                </p>
              </>
            )}
          </nav>

          {/* Manual Toggle Button */}
          <div className="px-3 py-2 border-t border-border">
            <button
              onClick={toggleSidebar}
              className={cn(
                "flex w-full items-center rounded-md py-2.5 text-sm font-medium text-foreground/70 hover:bg-muted transition-all duration-200",
                sidebarOpen ? "gap-3 px-4 justify-start" : "lg:justify-center gap-3 px-4 lg:px-0",
              )}
              title={sidebarOpen ? sidebarT.collapse || "Collapse sidebar" : sidebarT.expand || "Expand sidebar"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className={cn("shrink-0", sidebarOpen ? "h-5 w-5" : "h-5 w-5 lg:h-6 lg:w-6")} />
              ) : (
                <PanelLeftOpen className={cn("shrink-0", sidebarOpen ? "h-5 w-5" : "h-5 w-5 lg:h-6 lg:w-6")} />
              )}
              <span className={cn("whitespace-nowrap transition-opacity duration-200", !sidebarOpen && "lg:hidden")}>
                {sidebarT.collapse || "Collapse sidebar"}
              </span>
            </button>
          </div>

          {/* Logout button */}
          <div className="border-t border-border p-4 shrink-0">
            <button
              onClick={handleLogout}
              className={cn(
                "flex w-full items-center rounded-md py-2.5 text-sm font-medium text-foreground/70 hover:bg-muted transition-all duration-200",
                sidebarOpen ? "gap-3 px-4" : "lg:justify-center gap-3 px-4 lg:px-0",
              )}
              title={!sidebarOpen ? sidebarT.signOut || "Sign out" : undefined}
            >
              <LogOut className={cn("shrink-0", sidebarOpen ? "h-5 w-5" : "h-5 w-5 lg:h-6 lg:w-6")} />
              <span className={cn("whitespace-nowrap transition-opacity duration-200", !sidebarOpen && "lg:hidden")}>
                {sidebarT.signOut || "Sign out"}
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={toggleSidebar} />
      )}
    </>
  );
}