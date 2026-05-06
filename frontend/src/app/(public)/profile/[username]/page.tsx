"use client";

import { useParams } from "next/navigation";
import { FileText, UserCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useUserProfileQuery } from "@/queries";

export default function PublicProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const profileQuery = useUserProfileQuery(username);

  if (profileQuery.isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <Skeleton className="h-56 w-full rounded-3xl" />
      </main>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <EmptyState
          type="not-found"
          title="Profile not found"
          description="We couldn't find a public ATLAS profile for this user."
        />
      </main>
    );
  }

  const profile = profileQuery.data;

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <Card className="rounded-3xl">
        <CardContent className="space-y-6 p-8">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <UserCircle2 className="h-9 w-9 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                Public Profile
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                {profile.username}
              </h1>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border p-4">
              <p className="text-sm text-muted-foreground">Role</p>
              <p className="mt-2 font-medium">{profile.role}</p>
            </div>
            <div className="rounded-2xl border p-4">
              <p className="text-sm text-muted-foreground">Filiere</p>
              <p className="mt-2 font-medium">{profile.filiere || "Not set"}</p>
            </div>
            <div className="rounded-2xl border p-4">
              <p className="text-sm text-muted-foreground">Contributions</p>
              <p className="mt-2 flex items-center gap-2 font-medium">
                <FileText className="h-4 w-4 text-primary" />
                {profile.stats?.contributions_count ?? 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}