"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useCourseQuery } from "@/queries";
import { Brain, Loader2, FlipVertical, Check, X } from "lucide-react";

const DEMO_CARDS = [
  {
    id: "1",
    front: "What is a binary search tree?",
    back: "A binary tree where each node has at most two children, with the left child containing values less than the parent and the right child containing values greater.",
  },
  {
    id: "2",
    front: "What is the time complexity of binary search?",
    back: "O(log n) - it halves the search space with each comparison.",
  },
  {
    id: "3",
    front: "What is a hash table?",
    back: "A data structure that implements an associative array, using a hash function to compute an index into an array of buckets or slots.",
  },
];

export default function FlashcardsPage() {
  const params = useParams();
  const courseId = params.id as string;
  const { data: course } = useCourseQuery(courseId);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  const currentCard = DEMO_CARDS[currentIndex];

  const handleNext = () => {
    setIsFlipped(false);
    setShowAnswer(false);
    if (currentIndex < DEMO_CARDS.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    setIsFlipped(false);
    setShowAnswer(false);
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Flashcards</h1>
        <p className="text-muted-foreground">
          Study {course?.title || "this course"} with flashcards
        </p>
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Card {currentIndex + 1} of {DEMO_CARDS.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {currentCard ? (
            <>
              <div
                className={`min-h-[200px] rounded-lg border-2 p-6 flex items-center justify-center cursor-pointer transition-all ${
                  isFlipped ? "bg-primary/5 border-primary" : "bg-muted/50"
                }`}
                onClick={() => setIsFlipped(!isFlipped)}
              >
                <p className="text-center text-lg font-medium">
                  {isFlipped ? currentCard.back : currentCard.front}
                </p>
              </div>

              <div className="flex justify-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="gap-2"
                >
                  <FlipVertical className="h-4 w-4" />
                  Flip Card
                </Button>
              </div>

              <div className="flex justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handlePrevious}
                  disabled={currentIndex === 0}
                >
                  Previous
                </Button>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm">
                    <X className="h-4 w-4 mr-1" />
                    Again
                  </Button>
                  <Button variant="secondary" size="sm">
                    Hard
                  </Button>
                  <Button variant="secondary" size="sm">
                    Good
                  </Button>
                  <Button variant="success" size="sm">
                    <Check className="h-4 w-4 mr-1" />
                    Easy
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={handleNext}
                  disabled={currentIndex === DEMO_CARDS.length - 1}
                >
                  Next
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              type="flashcards"
              title="No flashcards"
              description="Generate flashcards from the course material"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
