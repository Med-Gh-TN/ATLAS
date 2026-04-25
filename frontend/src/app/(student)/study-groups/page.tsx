"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Users,
  Clock,
  Plus,
  Search,
  Lock,
  Globe,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useStudyGroupsQuery, useCreateStudyGroupMutation, StudyGroup } from "@/queries/study-groups";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

export default function StudyGroupsPage() {
  const { data: groupsData, isLoading } = useStudyGroupsQuery();
  const createMutation = useCreateStudyGroupMutation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newGroupData, setNewGroupData] = useState({ name: "", module: "", is_public: true });

  const groups = groupsData || [];
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "public" | "private">("all");

  const filteredGroups = groups.filter((group: StudyGroup) => {
    const matchesSearch =
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.module.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "public" && group.is_public) ||
      (filter === "private" && !group.is_public);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="container py-8 mx-auto max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Study Groups</h1>
          <p className="text-muted-foreground">
            Join or create collaborative study spaces
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Study Group</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label htmlFor="name" className="text-sm font-medium">Group Name</label>
                <Input
                  id="name"
                  value={newGroupData.name}
                  onChange={(e) => setNewGroupData({ ...newGroupData, name: e.target.value })}
                  placeholder="e.g. Physics 101 Finals Prep"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="module" className="text-sm font-medium">Module/Topic</label>
                <Input
                  id="module"
                  value={newGroupData.module}
                  onChange={(e) => setNewGroupData({ ...newGroupData, module: e.target.value })}
                  placeholder="e.g. Physique"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="public"
                  checked={newGroupData.is_public}
                  onChange={(e) => setNewGroupData({ ...newGroupData, is_public: e.target.checked })}
                />
                <label htmlFor="public" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Public (Anyone can join)
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setIsCreateOpen(false)} variant="ghost">Cancel</Button>
              <Button
                onClick={async () => {
                   await createMutation.mutateAsync({...newGroupData, max_members: 10});
                   setIsCreateOpen(false);
                   setNewGroupData({ name: "", module: "", is_public: true });
                }}
                disabled={!newGroupData.name || !newGroupData.module || createMutation.isPending}
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            All
          </Button>
          <Button
            variant={filter === "public" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("public")}
          >
            <Globe className="h-4 w-4 mr-2" />
            Public
          </Button>
          <Button
            variant={filter === "private" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("private")}
          >
            <Lock className="h-4 w-4 mr-2" />
            Private
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredGroups.length === 0 ? (
        <EmptyState
          type="custom"
          title="No groups found"
          description="Try adjusting your search or filters"
          icon={Users}
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredGroups.map((group: StudyGroup) => (
            <Card
              key={group.id}
              className="hover:border-primary transition-colors"
            >
              <CardContent className="pt-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">{group.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {group.module}
                      </p>
                    </div>
                  </div>
                  {group.is_public ? (
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {group.member_count}/{group.max_members} members
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {group.last_active}
                  </span>
                </div>
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/study-groups/${group.id}`}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Join Group
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
