/**
 * @file frontend/src/app/(admin)/layout.tsx
 * @description Admin layout wrapper containing Sidebar, Header, and internally scrolling Main content.
 * @layer Core Logic / Styling
 * @dependencies ["react", "@/components/layout/*", "@/lib/utils", "@/store/auth.store"]
 */

"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/layout/auth-guard";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/layout/command-palette";
import { Footer } from "@/components/layout/footer";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/auth.store";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarOpen } = useUIStore();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  return (
    <AuthGuard allowedRoles={["ADMIN"]}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar role="ADMIN" />
        
        <div className={cn(
          "flex flex-1 flex-col overflow-hidden transition-all duration-300",
          sidebarOpen ? "lg:ms-64" : "lg:ms-20"
        )}>
          <Header className="flex-shrink-0" />
          
          {/* Made <main> a flex column container.
            The wrapper around {children} gets flex-1 to push the footer down.
          */}
          <main className="flex flex-1 flex-col overflow-y-auto bg-transparent">
            <div className="container mx-auto flex-1 p-4 pb-20 lg:p-6 lg:pb-6">
              {children}
            </div>
            {/* The footer will now stay at the bottom of the scroll container */}
            <Footer variant="minimal" />
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