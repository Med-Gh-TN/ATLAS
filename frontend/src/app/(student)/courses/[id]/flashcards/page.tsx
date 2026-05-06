/**
 * @file frontend/src/app/(student)/courses/[id]/flashcards/page.tsx
 * @description Course-specific Flashcards Study Page.
 * SOTA FIX: Auto‑detects existing decks; auto‑generates if none exist.
 * @layer Core Logic
 */

"use client";

import { useMemo, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Brain, FlipVertical, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useCourseQuery,
  useFlashcardDueQuery,
  useGenerateFlashcardsMutation,
  useReviewFlashcardMutation,
} from "@/queries";
import { useQuery } from "@tanstack/react-query";
import { useTrackLearning } from "@/hooks/use-continue-learning";
import { coursesApi } from "@/lib/api";
import type { ReviewRating } from "@/types/api.types";

const reviewButtons: Array<{
  label: string;
  rating: ReviewRating;
  variant: "destructive" | "secondary" | "success";
}> = [
  { label: "Again", rating: "AGAIN", variant: "destructive" },
  { label: "Hard", rating: "HARD", variant: "secondary" },
  { label: "Good", rating: "GOOD", variant: "secondary" },
  { label: "Easy", rating: "EASY", variant: "success" },
];

export default function CourseFlashcardsPage() {
  const params = useParams();
  const courseId = params.id as string;
  const { data: course, isLoading: isCourseLoading } = useCourseQuery(courseId);
  const dueQuery = useFlashcardDueQuery();
  const generateMutation = useGenerateFlashcardsMutation();
  const reviewMutation = useReviewFlashcardMutation();

  useTrackLearning(courseId, course?.title || "Course Material", "flashcards");

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // ── Get the current course document version id ──
  const documentVersionId =
    course?.current_version_id ?? course?.current_version?.id ?? null;

  // ── Fetch user‑scoped asset metadata ──
  const { data: myAssets, isLoading: isAssetMetaLoading } = useQuery({
  queryKey: ["my-assets", courseId, documentVersionId],
  queryFn: async () => {
    try {
      return await coursesApi.getMyAssets(courseId, documentVersionId!);
    } catch {
      return {
        flashcards: { exists: false, id: null },
        quiz: { exists: false, id: null },
        summary: { exists: false, id: null },
        mindmap: { exists: false, id: null },
      };
    }
  },
  enabled: !!documentVersionId,
  retry: false,
});
  const cards = dueQuery.data?.items || [];
  const currentCard = cards[currentIndex];
  const isLoading = isCourseLoading || dueQuery.isLoading || isAssetMetaLoading;

  // ── Determine if a deck already exists ──
  const deckExists = myAssets?.flashcards?.exists === true;

  const heading = useMemo(() => course?.title || "this course", [course]);

  const resetCardState = () => {
    setIsFlipped(false);
  };

  // ── Generation helper (automatically called when no deck exists) ──
  const triggerGeneration = async () => {
    await generateMutation.mutateAsync({ courseId });
    await dueQuery.refetch();
    setCurrentIndex(0);
    resetCardState();
  };

  // ── Manual generate handler (for regenerate button if needed) ──
  const handleGenerate = async () => {
    await triggerGeneration();
  };

  const handleReview = async (rating: ReviewRating) => {
    if (!currentCard) return;
    await reviewMutation.mutateAsync({ cardId: currentCard.id, rating });
    await dueQuery.refetch();
    setCurrentIndex((prev) => {
      if (cards.length <= 1) return 0;
      return Math.min(prev, cards.length - 2);
    });
    resetCardState();
  };

  // ── AUTO‑GENERATION: if metadata loaded, no deck exists, and not already generating ──
  useEffect(() => {
    if (
      !isAssetMetaLoading &&
      myAssets &&
      !deckExists &&
      !generateMutation.isPending &&
      !dueQuery.isFetching
    ) {
      triggerGeneration();
    }
  }, [
    isAssetMetaLoading,
    myAssets,
    deckExists,
    generateMutation.isPending,
    dueQuery.isFetching,
  ]);

  // ── UI STATES ──

  // Loading skeleton / spinner
  if (isLoading || generateMutation.isPending) {
    return (
      <div className="flex items-center justify-center h-[480px] w-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Flashcards</h1>
          <p className="text-muted-foreground">
            Review flashcards generated from {heading}.
          </p>
        </div>
        {/* Regenerate button – only visible when deck already exists */}
        {deckExists && (
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            variant="outline"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Regenerating…
              </>
            ) : (
              <>
                <Brain className="h-4 w-4" />
                Regenerate Flashcards
              </>
            )}
          </Button>
        )}
      </div>

      {currentCard ? (
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Card {currentIndex + 1} of {cards.length}
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {currentCard.difficulty || "Unrated"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <button
              type="button"
              className={`flex min-h-[240px] w-full items-center justify-center rounded-lg border-2 p-6 text-left transition-colors ${
                isFlipped ? "border-primary bg-primary/5" : "bg-muted/40"
              }`}
              onClick={() => setIsFlipped((value) => !value)}
            >
              <p className="text-center text-lg font-medium">
                {isFlipped ? currentCard.answer : currentCard.question}
              </p>
            </button>

            <div className="flex justify-center">
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => setIsFlipped((value) => !value)}
              >
                <FlipVertical className="h-4 w-4" />
                Flip Card
              </Button>
            </div>

            <div className="flex flex-wrap justify-center gap-2 border-t pt-4">
              {reviewButtons.map((action) => (
                <Button
                  key={action.rating}
                  variant={action.variant}
                  className="min-h-11"
                  disabled={reviewMutation.isPending}
                  onClick={() => handleReview(action.rating)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          type="flashcards"
          title={deckExists ? "All caught up!" : "No due flashcards yet"}
          description={
            deckExists
              ? "You’ve reviewed all cards. Well done! Come back later or regenerate for a fresh deck."
              : "Generating flashcards for this course…"
          }
          action={
            deckExists
              ? {
                  label: "Regenerate Flashcards",
                  onClick: handleGenerate,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}