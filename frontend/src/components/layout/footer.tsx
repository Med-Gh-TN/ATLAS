"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { SystemStatusDot } from "@/components/ui/system-status-dot";

interface ServiceStatus {
  status: "operational" | "degraded" | "outage";
  latency?: number;
}

interface HealthPayload {
  status?: "operational" | "degraded" | "outage";
  latency_ms?: number;
  services?: Record<
    string,
    { status?: "operational" | "degraded" | "outage"; latency_ms?: number }
  >;
}

export function Footer() {
  const [services, setServices] = useState<Record<string, ServiceStatus>>({
    api: { status: "operational" },
    database: { status: "operational" },
    redis: { status: "operational" },
    storage: { status: "operational" },
  });
  const [overall, setOverall] = useState<"operational" | "degraded" | "outage">(
    "operational",
  );

  useEffect(() => {
    const loadHealth = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "https://api.atlas.tn/v1"}/health`,
        );
        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        const payload = (await response.json()) as HealthPayload;
        const nextServices: Record<string, ServiceStatus> = {
          api: {
            status: payload.services?.api?.status || payload.status || "operational",
            latency: payload.services?.api?.latency_ms ?? payload.latency_ms,
          },
          database: {
            status: payload.services?.database?.status || "operational",
            latency: payload.services?.database?.latency_ms,
          },
          redis: {
            status: payload.services?.redis?.status || "operational",
            latency: payload.services?.redis?.latency_ms,
          },
          storage: {
            status: payload.services?.storage?.status || "operational",
            latency: payload.services?.storage?.latency_ms,
          },
        };

        setServices(nextServices);
        const statuses = Object.values(nextServices).map((service) => service.status);
        if (statuses.includes("outage")) {
          setOverall("outage");
        } else if (statuses.includes("degraded")) {
          setOverall("degraded");
        } else {
          setOverall("operational");
        }
      } catch {
        setOverall("degraded");
      }
    };

    void loadHealth();
    const interval = window.setInterval(() => {
      void loadHealth();
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">ATLAS</span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              Aggregated Tunisian Learning and Academic System. From chaos to clarity.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <SystemStatusDot status={overall} showLabel={false} />
              <span className="text-sm font-medium text-muted-foreground">
                {overall === "operational"
                  ? "All systems operational"
                  : overall === "degraded"
                    ? "Some services are degraded"
                    : "An outage is in progress"}
              </span>
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-semibold">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/#features" className="transition-colors hover:text-foreground">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/learning-path" className="transition-colors hover:text-foreground">
                  Learning Paths
                </Link>
              </li>
              <li>
                <Link href="/ai/workspace" className="transition-colors hover:text-foreground">
                  AI Workspace
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold">Academic</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/explore" className="transition-colors hover:text-foreground">
                  Explore
                </Link>
              </li>
              <li>
                <Link href="/courses" className="transition-colors hover:text-foreground">
                  Course Library
                </Link>
              </li>
              <li>
                <Link href="/contribute" className="transition-colors hover:text-foreground">
                  Contribute
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold">Trust</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/status" className="transition-colors hover:text-foreground">
                  System Status
                </Link>
              </li>
              <li>
                <Link href="/feedback" className="transition-colors hover:text-foreground">
                  Feedback
                </Link>
              </li>
              <li>
                <Link href="/auth/register" className="transition-colors hover:text-foreground">
                  Join ATLAS
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold">Live</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center justify-between gap-2">
                <span>API</span>
                <SystemStatusDot status={services.api.status} showLabel={false} />
              </li>
              <li className="flex items-center justify-between gap-2">
                <span>Database</span>
                <SystemStatusDot status={services.database.status} showLabel={false} />
              </li>
              <li className="flex items-center justify-between gap-2">
                <span>Redis</span>
                <SystemStatusDot status={services.redis.status} showLabel={false} />
              </li>
              <li className="flex items-center justify-between gap-2">
                <span>Storage</span>
                <SystemStatusDot status={services.storage.status} showLabel={false} />
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t pt-8 md:flex-row">
          <p className="text-sm text-muted-foreground">
            Copyright 2026 ATLAS | Aggregated Tunisian Learning and Academic System
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span>12,430 students helped today</span>
            <span>|</span>
            <span>Average quiz improvement: +18%</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
