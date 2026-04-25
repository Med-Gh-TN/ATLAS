"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/layout/auth-guard";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/layout/command-palette";

export default function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  return (
    <AuthGuard allowedRoles={["SUPERADMIN"]}>
      <div className="flex min-h-screen flex-col">
        <Header className="sticky top-0 z-50 border-b" />
        <div className="flex flex-1">
          <Sidebar role="SUPERADMIN" />
          <main className="flex-1 transition-all duration-300 lg:ml-64">
            <div className="container mx-auto p-4 lg:p-6">{children}</div>
          </main>
        </div>
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
        />
      </div>
    </AuthGuard>
  );
}
