"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/layout/auth-guard";
import { useUIStore } from "@/store/auth.store";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/layout/command-palette";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarOpen } = useUIStore();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  return (
    <AuthGuard allowedRoles={["STUDENT"]}>
      <div className="flex min-h-screen flex-col">
        <Header className="sticky top-0 z-50 border-b" />
        <div className="flex flex-1">
          <Sidebar role="STUDENT" />
          <main
            className={`flex-1 transition-all duration-300 ${
              sidebarOpen ? "lg:ml-64" : "lg:ml-20"
            }`}
          >
            <div className="container mx-auto p-4 pb-20 lg:p-6 lg:pb-6">
              {children}
            </div>
          </main>
          <BottomNav />
        </div>
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
        />
      </div>
    </AuthGuard>
  );
}
