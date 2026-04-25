"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useCourseQuery } from "@/queries";
import {
  FileQuestion,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

export default function QuizPage() {
  const params = useParams();
  const courseId = params.id as string;
  const { data: course } = useCourseQuery(courseId);
  const [isGenerating, setIsGenerating] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(15);

  const handleStartQuiz = () => {
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quiz</h1>
          <p className="text-muted-foreground">
            Test your knowledge of {course?.title || "this course"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileQuestion className="h-5 w-5" />
            Generate New Quiz
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Time Limit</label>
              <Select
                value={String(timerMinutes)}
                onChange={(e) => setTimerMinutes(Number(e.target.value))}
              >
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">60 minutes</option>
              </Select>
            </div>
            <Button onClick={handleStartQuiz} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileQuestion className="h-4 w-4 mr-2" />
                  Start Quiz
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[300px] flex items-center justify-center">
        <EmptyState
          type="quiz"
          title="No active quiz"
          description="Generate a quiz to test your knowledge"
        />
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">5</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">82%</p>
                <p className="text-sm text-muted-foreground">Average Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <FileQuestion className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">45</p>
                <p className="text-sm text-muted-foreground">
                  Questions Answered
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
