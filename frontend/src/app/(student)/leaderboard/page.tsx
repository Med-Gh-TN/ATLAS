"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trophy, Medal, Crown, TrendingUp, Filter, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useLeaderboardQuery } from "@/queries";
import { useAuthStore } from "@/store/auth.store";

const FILIERES = [
  "All",
  "Informatique",
  "Mathematiques",
  "Physique",
  "Chimie",
  "Biologie",
  "Economie",
  "Droit",
];

export default function LeaderboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [filiere, setFiliere] = useState<string>("All");
  const [limit, setLimit] = useState(20);

  const { data: leaderboard, isLoading } = useLeaderboardQuery(
    limit,
    filiere === "All" ? undefined : filiere,
  );

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-6 w-6 text-amber-500" />;
      case 2:
        return <Medal className="h-6 w-6 text-gray-400" />;
      case 3:
        return <Medal className="h-6 w-6 text-amber-700" />;
      default:
        return <span className="font-bold text-muted-foreground">#{rank}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <p className="text-muted-foreground">
          See how you rank against other students
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Select
          value={filiere}
          onChange={(e) => setFiliere(e.target.value)}
          className="w-48"
        >
          {FILIERES.map((f) => (
            <option key={f} value={f}>
              {f === "All" ? "All Programs" : f}
            </option>
          ))}
        </Select>
        <Select
          value={String(limit)}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="w-32"
        >
          <option value="10">Top 10</option>
          <option value="20">Top 20</option>
          <option value="50">Top 50</option>
          <option value="100">Top 100</option>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : leaderboard?.length === 0 ? (
        <EmptyState
          type="no-results"
          title="No data yet"
          description="The leaderboard will populate as students earn XP"
        />
      ) : leaderboard ? (
        <div className="space-y-3">
          {leaderboard.map((entry, index) => {
            const rank = index + 1;
            const isCurrentUser = entry.user_id === user?.id;

            return (
              <Card
                key={entry.user_id}
                className={`transition-colors ${
                  isCurrentUser
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                <CardContent className="flex items-center gap-4 py-3">
                  <div className="flex h-10 w-10 items-center justify-center">
                    {getRankIcon(rank)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-medium truncate ${isCurrentUser ? "text-primary" : ""}`}
                    >
                      {entry.name}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (You)
                        </span>
                      )}
                    </p>
                    {entry.filiere && (
                      <p className="text-xs text-muted-foreground">
                        {entry.filiere}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-lg">
                      {entry.xp.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">XP</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            How XP Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="font-medium">Study Sessions</p>
              <p className="text-sm text-muted-foreground">+10 XP per hour</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium">Flashcards</p>
              <p className="text-sm text-muted-foreground">+2 XP per review</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium">Quiz Completion</p>
              <p className="text-sm text-muted-foreground">+20 XP per quiz</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium">Contributions</p>
              <p className="text-sm text-muted-foreground">+50 XP per upload</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
