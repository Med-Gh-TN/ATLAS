"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCourseQuery } from "@/queries";
import { coursesApi, quizApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export default function CourseQuizPage() {
  const params = useParams();
  const courseId = params.id as string;
  const { data: course, isLoading: isCourseLoading } = useCourseQuery(courseId);

  const documentVersionId =
    course?.current_version_id || course?.current_version?.id || null;

  const {
    data: myAssets,
    isLoading: isAssetMetaLoading,
  } = useQuery({
    queryKey: ["my-assets", courseId, documentVersionId],
    queryFn: () => coursesApi.getMyAssets(courseId, documentVersionId!),
    enabled: !!documentVersionId,
  });

  const [quizData, setQuizData] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuiz = useCallback(async (quizId: string) => {
    const data = await quizApi.getQuiz(quizId);
    setQuizData(data);
  }, []);

  const generateQuiz = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const { job_id } = await quizApi.generate(courseId, 10);
      await fetchQuiz(job_id);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to generate quiz. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [courseId, fetchQuiz]);

  useEffect(() => {
    if (!myAssets || isAssetMetaLoading) return;
    if (quizData) return;

    if (myAssets.quiz.exists && myAssets.quiz.id) {
      fetchQuiz(myAssets.quiz.id);
    } else {
      generateQuiz();
    }
  }, [myAssets, isAssetMetaLoading, quizData, fetchQuiz, generateQuiz]);

  if (isCourseLoading || isAssetMetaLoading || generating) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !quizData) {
    return (
      <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center gap-4">
        <p className="text-sm text-destructive">{error || "Could not load quiz."}</p>
        <Button onClick={generateQuiz}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-2xl font-bold">Quiz</h2>
      <p className="text-muted-foreground">
        {quizData.total_questions} questions · {quizData.time_limit_minutes} min
      </p>
      {quizData.questions?.map((q: any, idx: number) => (
        <div key={q.id || idx} className="rounded-lg border p-4">
          <p className="font-medium">
            {idx + 1}. {q.question}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {Array.isArray(q.options)
              ? q.options.map((opt: any, oi: number) => (
                  <div
                    key={oi}
                    className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
                  >
                    {typeof opt === "string"
                      ? opt
                      : opt?.key
                      ? `${opt.key}: ${opt.value}`
                      : JSON.stringify(opt)}
                  </div>
                ))
              : null}
          </div>
        </div>
      ))}
    </div>
  );
}