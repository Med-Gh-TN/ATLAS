"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Target,
  BookOpen,
  Layers,
  FileQuestion,
  Clock,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuthStore } from "@/store/auth.store";
import { useGenerateLearningPath, useLearningPathJob, LearningPath, LearningStep } from "@/queries/learning-path";
import { useEffect } from "react";



const TIME_OPTIONS = [
  { value: "1_week", label: "1 Week" },
  { value: "2_weeks", label: "2 Weeks" },
  { value: "1_month", label: "1 Month" },
];

const FILIERES = [
  "Informatique",
  "Mathématiques",
  "Physique",
  "Chimie",
  "Biologie",
  "Économie",
  "Droit",
  "Médecine",
];

export default function LearningPathPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [goal, setGoal] = useState("");
  const [filiere, setFiliere] = useState(user?.filiere || "");
  const [timeAvailable, setTimeAvailable] = useState("2_weeks");
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);

  const generateMutation = useGenerateLearningPath();
  const { data: jobData, isLoading: isJobLoading } = useLearningPathJob(jobId);

  const learningPath = jobData?.status === "completed" ? jobData.result : null;
  const isGenerating = generateMutation.isPending || (jobId !== null && jobData?.status !== "completed" && jobData?.status !== "failed");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("learning_path_progress");
      if (saved) {
        setCompletedSteps(new Set(JSON.parse(saved)));
      }
    }
  }, []);

  const handleGenerate = async () => {
    if (!goal.trim()) return;

    try {
      const res = await generateMutation.mutateAsync({
        title: goal,
        topics: [filiere, timeAvailable],
      });
      setJobId(res.id);
    } catch (error) {
      console.error("Failed to generate learning path:", error);
    }
  };

  const toggleStep = (order: number) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(order)) {
      newCompleted.delete(order);
    } else {
      newCompleted.add(order);
    }
    setCompletedSteps(newCompleted);

    if (typeof window !== "undefined") {
      localStorage.setItem(
        "learning_path_progress",
        JSON.stringify([...newCompleted]),
      );
    }
  };

  const getStepIcon = (type: LearningStep["type"]) => {
    switch (type) {
      case "READ":
        return BookOpen;
      case "STUDY":
        return Layers;
      case "TEST":
        return FileQuestion;
    }
  };

  const getStepColor = (type: LearningStep["type"]) => {
    switch (type) {
      case "READ":
        return "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400";
      case "STUDY":
        return "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400";
      case "TEST":
        return "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400";
    }
  };

  return (
    <div className="container py-8 mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Learning Path Generator</h1>
        <p className="text-muted-foreground">
          Create a personalized AI-powered learning roadmap to achieve your
          goals
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Define Your Goal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              What do you want to achieve?
            </label>
            <Input
              placeholder="e.g., Pass the Algorithms exam, Master Python programming..."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="text-lg"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Filiere</label>
              <select
                value={filiere}
                onChange={(e) => setFiliere(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
              >
                <option value="">Select filiere...</option>
                {FILIERES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Time Available
              </label>
              <div className="flex gap-2">
                {TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeAvailable(opt.value)}
                    className={`flex-1 px-4 py-2 rounded-lg border text-sm transition-colors ${
                      timeAvailable === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!goal.trim() || isGenerating}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating your learning path...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Learning Path
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {learningPath && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Your Learning Path</CardTitle>
                <span className="text-sm text-muted-foreground">
                  Estimated: {learningPath.estimated_total_hours} hours
                </span>
              </div>
              <p className="text-muted-foreground mt-1">
                Goal: {learningPath.goal}
              </p>
            </CardHeader>
          </Card>

          <div className="relative pl-8">
            <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />

            {learningPath.steps.map((step: LearningStep, index: number) => {
              const Icon = getStepIcon(step.type);
              const isCompleted = completedSteps.has(step.order);
              const isLast = index === learningPath.steps.length - 1;

              return (
                <div
                  key={step.order}
                  className={`relative mb-6 ${isLast ? "" : ""}`}
                >
                  <div
                    className={`absolute -left-3 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      isCompleted
                        ? "bg-green-500 border-green-500 text-white"
                        : "bg-background border-muted-foreground"
                    }`}
                    onClick={() => toggleStep(step.order)}
                    style={{ cursor: "pointer" }}
                  >
                    {isCompleted && <CheckCircle2 className="h-4 w-4" />}
                  </div>

                  <Card
                    className={`ml-4 transition-colors ${
                      isCompleted ? "opacity-60" : ""
                    }`}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-start gap-4">
                        <div
                          className={`p-2 rounded-lg ${getStepColor(step.type)}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{step.title}</h3>
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full ${getStepColor(step.type)}`}
                            >
                              {step.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            {step.estimated_minutes && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {step.estimated_minutes} min
                              </span>
                            )}
                            {step.card_count && (
                              <span>{step.card_count} cards</span>
                            )}
                            {step.question_count && (
                              <span>{step.question_count} questions</span>
                            )}
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          {step.type === "READ" && "Start Reading"}
                          {step.type === "STUDY" && "Study Now"}
                          {step.type === "TEST" && "Take Quiz"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
