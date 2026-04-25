"use client";

import { useState } from "react";
import {
  Brain,
  TrendingUp,
  BookOpen,
  Layers,
  FileQuestion,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useStudentHistoryQuery } from "@/queries/dashboard";
import { useQuizHistoryQuery } from "@/queries/study";
import { useMemo } from "react";

interface WeakTopic {
  topic_name: string;
  mastery_percentage: number;
  recommended_action: "READ" | "STUDY" | "TEST";
  course_id?: string;
  deck_id?: string;
  quiz_id?: string;
}

const MOCK_WEAK_TOPICS: WeakTopic[] = [
  {
    topic_name: "Sorting Algorithms",
    mastery_percentage: 35,
    recommended_action: "READ",
    course_id: "1",
  },
  {
    topic_name: "Binary Trees",
    mastery_percentage: 52,
    recommended_action: "STUDY",
    deck_id: "1",
  },
  {
    topic_name: "Dynamic Programming",
    mastery_percentage: 28,
    recommended_action: "READ",
    course_id: "2",
  },
  {
    topic_name: "SQL Joins",
    mastery_percentage: 68,
    recommended_action: "TEST",
    quiz_id: "1",
  },
  {
    topic_name: "Graph Theory",
    mastery_percentage: 45,
    recommended_action: "STUDY",
    deck_id: "2",
  },
];

export default function WeaknessAnalysisPage() {
  const { data: studyHistory, isLoading: isLoadingStudy } = useStudentHistoryQuery();
  const { data: quizHistory, isLoading: isLoadingQuiz } = useQuizHistoryQuery();

  const weakTopics = useMemo(() => {
    // If we have actual items, process them; otherwise fallback to empty
    // In a real scenario we parse quizHistory scores vs studyHistory attempts
    const topics: WeakTopic[] = [];

    if (Array.isArray(quizHistory)) {
      quizHistory.forEach((q: any) => {
        if (q.score !== undefined && q.score < 70) {
          topics.push({
            topic_name: q.course?.title || `Quiz ${q.id.substring(0,4)}`,
            mastery_percentage: q.score,
            recommended_action: "TEST",
            quiz_id: q.quiz_id,
          });
        }
      });
    }

    if (topics.length === 0 && (studyHistory?.items || []).length > 0) {
        topics.push({
          topic_name: "General Review",
          mastery_percentage: 45,
          recommended_action: "STUDY",
        });
    }

    // Default mock data if completely empty so the UI isn't totally blank while demonstrating
    return topics.length ? topics : MOCK_WEAK_TOPICS;
  }, [quizHistory, studyHistory]);

  const isLoading = isLoadingStudy || isLoadingQuiz;

  const overallMastery = weakTopics.length
    ? Math.round(
      weakTopics.reduce((acc, t) => acc + t.mastery_percentage, 0) /
        weakTopics.length,
      )
    : 0;

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getMasteryColor = (percentage: number) => {
    if (percentage < 40) return "text-red-500";
    if (percentage < 70) return "text-yellow-500";
    return "text-green-500";
  };

  const getMasteryBg = (percentage: number) => {
    if (percentage < 40) return "bg-red-500";
    if (percentage < 70) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getActionIcon = (action: WeakTopic["recommended_action"]) => {
    switch (action) {
      case "READ":
        return BookOpen;
      case "STUDY":
        return Layers;
      case "TEST":
        return FileQuestion;
    }
  };

  const getActionLabel = (action: WeakTopic["recommended_action"]) => {
    switch (action) {
      case "READ":
        return "Read Course";
      case "STUDY":
        return "Study Flashcards";
      case "TEST":
        return "Take Quiz";
    }
  };

  return (
    <div className="container py-8 mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Weakness Analysis</h1>
        <p className="text-muted-foreground">
          Identify your learning gaps and get personalized recommendations
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Overall Mastery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <div className="relative w-32 h-32">
                <svg className="w-32 h-32 -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-muted"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${overallMastery * 3.52} 352`}
                    className={getMasteryColor(overallMastery)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className={`text-4xl font-bold ${getMasteryColor(overallMastery)}`}
                  >
                    {overallMastery}%
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Topic Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {weakTopics.map((topic) => (
              <div key={topic.topic_name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{topic.topic_name}</span>
                  <span
                    className={`font-medium ${getMasteryColor(topic.mastery_percentage)}`}
                  >
                    {topic.mastery_percentage}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getMasteryBg(topic.mastery_percentage)}`}
                    style={{ width: `${topic.mastery_percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-bold mb-4">Areas to Improve</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {weakTopics
          .filter((t) => t.mastery_percentage < 50)
          .map((topic) => {
            const ActionIcon = getActionIcon(topic.recommended_action);
            return (
              <Card
                key={topic.topic_name}
                className="hover:border-primary transition-colors"
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                      <Brain className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <span
                      className={`text-sm font-medium ${getMasteryColor(topic.mastery_percentage)}`}
                    >
                      {topic.mastery_percentage}%
                    </span>
                  </div>
                  <h3 className="font-medium mb-1">{topic.topic_name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Needs more practice in this area
                  </p>
                  <Button variant="outline" size="sm" className="w-full">
                    <ActionIcon className="h-4 w-4 mr-2" />
                    {getActionLabel(topic.recommended_action)}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
      </div>

      <h2 className="text-xl font-bold mb-4">Suggested This Week</h2>
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 w-fit mb-3">
              <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-medium mb-1">Review Sorting Algorithms</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Spend 30 minutes reviewing the fundamentals
            </p>
            <Button size="sm" className="w-full">
              Start Reading
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 w-fit mb-3">
              <Layers className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-medium mb-1">Practice Binary Trees</h3>
            <p className="text-sm text-muted-foreground mb-4">
              15 flashcards to review and master
            </p>
            <Button variant="outline" size="sm" className="w-full">
              Study Flashcards
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 w-fit mb-3">
              <FileQuestion className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="font-medium mb-1">Test SQL Joins</h3>
            <p className="text-sm text-muted-foreground mb-4">
              10 questions to test your knowledge
            </p>
            <Button variant="outline" size="sm" className="w-full">
              Take Quiz
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
