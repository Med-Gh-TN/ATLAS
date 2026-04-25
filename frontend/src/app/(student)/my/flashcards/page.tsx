"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Brain,
  Clock,
  Star,
  Plus,
  ChevronRight,
  Share2,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useFlashcardDecksQuery } from "@/queries";

export default function MyFlashcardsPage() {
  const { data: decks, isLoading } = useFlashcardDecksQuery();
  const [filter, setFilter] = useState<"all" | "due">("all");

  const filteredDecks = decks?.filter((deck) => {
    if (filter === "due") return (deck.due_cards_count || 0) > 0;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Flashcards</h1>
          <p className="text-muted-foreground">
            Review and manage your flashcard decks
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Deck
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          All Decks
        </Button>
        <Button
          variant={filter === "due" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("due")}
        >
          Due for Review
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : filteredDecks?.length === 0 ? (
        <EmptyState
          type="flashcards"
          title="No flashcard decks"
          description="Create your first deck to start learning"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDecks?.map((deck) => (
            <Card
              key={deck.id}
              className="transition-colors hover:border-primary/50"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Brain className="h-5 w-5 text-primary" />
                  </div>
                  {deck.due_cards_count && deck.due_cards_count > 0 && (
                    <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                      {deck.due_cards_count} due
                    </span>
                  )}
                </div>
                <CardTitle className="mt-3 line-clamp-1">
                  {deck.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {deck.created_at
                      ? new Date(deck.created_at).toLocaleDateString()
                      : "N/A"}
                  </span>
                  {deck.mastery_percentage !== undefined && (
                    <span className="flex items-center gap-1">
                      <Star className="h-4 w-4" />
                      {deck.mastery_percentage}%
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    asChild
                  >
                    <Link
                      href={`/courses/${deck.document_version_id}/flashcards?deck=${deck.id}`}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Study
                    </Link>
                  </Button>
                  {deck.share_token && (
                    <Button variant="ghost" size="sm">
                      <Share2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
