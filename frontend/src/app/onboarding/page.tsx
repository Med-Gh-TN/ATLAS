"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  User,
  Search,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOnboardingStore } from "@/store/onboarding.store";
import { useAuthStore } from "@/store/auth.store";
import { authApi } from "@/lib/api";
import type { StudentLevel } from "@/types/api.types";

const steps = [
  {
    id: 1,
    title: "Welcome to ATLAS",
    description:
      "Your intelligent companion for academic excellence in Tunisia",
    icon: GraduationCap,
  },
  {
    id: 2,
    title: "Complete Your Profile",
    description: "Help us personalize your learning experience",
    icon: User,
  },
  {
    id: 3,
    title: "Discover Courses",
    description: "Search and explore our extensive course library",
    icon: Search,
  },
  {
    id: 4,
    title: "AI-Powered Tools",
    description: "Chat, flashcards, quizzes, summaries, and mind maps",
    icon: Sparkles,
  },
  {
    id: 5,
    title: "Find Your First Course",
    description: "Let's get started with your learning journey",
    icon: Sparkle,
  },
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

export default function OnboardingPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const onboardingStore = useOnboardingStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentStep = onboardingStore.currentStep;
  const { fullName, filiere, niveau } = onboardingStore.profile;
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (user?.onboarding_completed) {
      router.replace(user.role === "TEACHER" ? "/teacher/dashboard" : "/dashboard");
    }
  }, [user, router]);

  const handleNext = () => {
    if (currentStep < steps.length) {
      onboardingStore.nextStep();
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      onboardingStore.prevStep();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      const updatedUser = await authApi.updateProfile({
        onboarding_completed: true,
        full_name: fullName || undefined,
        filiere: filiere || undefined,
        niveau: (niveau as StudentLevel) || undefined,
      });
      setUser(updatedUser);
      onboardingStore.completeOnboarding();
      router.push(updatedUser.role === "TEACHER" ? "/teacher/dashboard" : "/dashboard");
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex flex-col">
      <div className="container max-w-2xl mx-auto flex-1 flex flex-col justify-center py-12 px-4">
        <div className="text-center mb-8">
          <GraduationCap className="h-12 w-12 mx-auto text-primary mb-4" />
          <div className="flex justify-center gap-2 mb-4">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`h-2 rounded-full transition-all ${
                  step.id <= currentStep ? "w-8 bg-primary" : "w-2 bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-8 pb-12 px-8">
            <div className="text-center mb-8">
              {currentStep === 1 && (
                <>
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <GraduationCap className="h-10 w-10 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Welcome to ATLAS</h2>
                  <p className="text-muted-foreground">
                    Your intelligent companion for academic excellence in
                    Tunisia
                  </p>
                </>
              )}

              {currentStep === 2 && (
                <>
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <User className="h-10 w-10 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold mb-6">
                    Complete Your Profile
                  </h2>
                  <div className="space-y-4 text-left">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Full Name
                      </label>
                      <Input
                        placeholder="Enter your full name"
                        value={fullName}
                        onChange={(e) => onboardingStore.setProfile({ fullName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Filiere
                      </label>
                      <select
                        value={filiere}
                        onChange={(e) => onboardingStore.setProfile({ filiere: e.target.value })}
                        className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm"
                      >
                        <option value="">Select your filiere...</option>
                        {FILIERES.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Level
                      </label>
                      <div className="flex gap-2">
                        {["L1", "L2", "L3", "M1", "M2"].map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => onboardingStore.setProfile({ niveau: level })}
                            className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${
                              niveau === level
                                ? "border-primary bg-primary/5"
                                : "hover:border-muted-foreground"
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {currentStep === 3 && (
                <>
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Search className="h-10 w-10 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Discover Courses</h2>
                  <p className="text-muted-foreground mb-6">
                    Browse thousands of courses across all Tunisian faculties
                  </p>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    <Search className="h-5 w-5 text-muted-foreground ml-2" />
                    <span className="text-sm text-muted-foreground">
                      Search by course name, topic, or filiere
                    </span>
                  </div>
                </>
              )}

              {currentStep === 4 && (
                <>
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Sparkles className="h-10 w-10 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">AI-Powered Tools</h2>
                  <p className="text-muted-foreground mb-6">
                    Supercharge your learning with our intelligent tools
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-left">
                    {[
                      {
                        name: "AI Chat",
                        desc: "Ask questions about any course",
                      },
                      { name: "Flashcards", desc: "Smart spaced repetition" },
                      { name: "Quiz Generator", desc: "Test your knowledge" },
                      { name: "Mind Maps", desc: "Visual learning made easy" },
                    ].map((tool) => (
                      <div key={tool.name} className="p-3 bg-muted rounded-lg">
                        <p className="font-medium text-sm">{tool.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {tool.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {currentStep === 5 && (
                <>
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Sparkle className="h-10 w-10 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">
                    Find Your First Course
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    Start your learning journey today
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="What do you want to learn?"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      className="flex-1"
                    />
                    <Button onClick={handleSearch}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          {currentStep > 1 && (
            <button
              onClick={handleSkip}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
          )}

          <Button onClick={handleNext} disabled={isSubmitting}>
            {currentStep === steps.length ? (
              <>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Get Started
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
