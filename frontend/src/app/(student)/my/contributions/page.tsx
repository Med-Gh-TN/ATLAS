"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useContributionsMineQuery } from "@/queries";

export default function MyContributionsPage() {
  const router = useRouter();
  const { data: contributions, isLoading } = useContributionsMineQuery();
  const [filter, setFilter] = useState<
    "all" | "PENDING" | "APPROVED" | "REJECTED"
  >("all");

  const filteredContributions = contributions?.items?.filter((c) => {
    if (filter === "all") return true;
    return c.status === filter;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Contributions</h1>
        <p className="text-muted-foreground">Track your uploaded documents</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        <Button
          variant={filter === "PENDING" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("PENDING")}
        >
          Pending
        </Button>
        <Button
          variant={filter === "APPROVED" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("APPROVED")}
        >
          Approved
        </Button>
        <Button
          variant={filter === "REJECTED" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("REJECTED")}
        >
          Rejected
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : filteredContributions?.length === 0 ? (
        <EmptyState
          type="contributions"
          title="No contributions"
          description="Start contributing to see your uploads here"
          action={{
            label: "Upload Now",
            onClick: () => router.push("/contribute"),
          }}
        />
      ) : (
        <div className="space-y-3">
          {filteredContributions?.map((contribution) => (
            <Card
              key={contribution.id}
              className="transition-colors hover:bg-muted/50"
            >
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">
                    {contribution.title}
                  </h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {contribution.description || "No description"}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(contribution.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusChip status={contribution.status} />
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={`/contributions/${contribution.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
