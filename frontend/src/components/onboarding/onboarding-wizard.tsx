"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  User,
  Search,
  Sparkles,
  Sparkle,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OnboardingStep } from "./onboarding-step";
import { useOnboardingStore } from "@/store/onboarding.store";

const steps = [
  {
    id: 1,
    title: "Welcome to ATLAS",
    description: "Your intelligent companion for academic excellence",
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

interface OnboardingWizardProps {
  onComplete?: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const router = useRouter();
  const {
    currentStep,
    setStep,
    nextStep,
    prevStep,
    profile,
    setProfile,
    completeOnboarding,
  } = useOnboardingStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleNext = () => {
    if (currentStep < steps.length) {
      nextStep();
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      prevStep();
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    completeOnboarding();
    setIsLoading(false);
    if (onComplete) {
      onComplete();
    } else {
      router.push("/courses");
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <GraduationCap className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Welcome to ATLAS</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your intelligent companion for academic excellence in Tunisia.
              Let's take a few minutes to set up your profile.
            </p>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <User className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Complete Your Profile</h2>
              <p className="text-muted-foreground">
                Help us personalize your learning experience
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Full Name
                </label>
                <Input
                  placeholder="Enter your full name"
                  value={profile.fullName}
                  onChange={(e) => setProfile({ fullName: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Field of Study
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {FILIERES.map((f) => (
                    <button
                      key={f}
                      onClick={() => setProfile({ filiere: f })}
                      className={`p-3 rounded-lg border text-sm transition-colors ${
                        profile.filiere === f
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:bg-muted"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Level</label>
                <div className="flex gap-2">
                  {["L1", "L2", "L3", "M1", "M2"].map((level) => (
                    <button
                      key={level}
                      onClick={() => setProfile({ niveau: level })}
                      className={`flex-1 p-3 rounded-lg border text-sm transition-colors ${
                        profile.niveau === level
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:bg-muted"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Search className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Discover Courses</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Search and explore our extensive course library covering all major
              disciplines taught in Tunisian universities.
            </p>
            <div className="max-w-md mx-auto">
              <Input
                placeholder="Search for courses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        );

      case 4:
        return (
          <div className="text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Sparkles className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">AI-Powered Tools</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              ATLAS provides intelligent tools to enhance your learning:
            </p>
            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto text-left">
              {[
                { name: "AI Chat", desc: "Ask questions about courses" },
                { name: "Flashcards", desc: "Generate study cards" },
                { name: "Quizzes", desc: "Test your knowledge" },
                { name: "Mind Maps", desc: "Visualize concepts" },
              ].map((tool) => (
                <div key={tool.name} className="p-3 rounded-lg bg-muted">
                  <p className="font-medium text-sm">{tool.name}</p>
                  <p className="text-xs text-muted-foreground">{tool.desc}</p>
                </div>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Sparkle className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">You're All Set!</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Your profile is ready. Start exploring courses and let ATLAS help
              you achieve academic excellence.
            </p>
            <div className="p-4 rounded-lg bg-primary/10 max-w-md mx-auto">
              <p className="text-sm font-medium text-primary">
                Ready to start your learning journey?
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-1">
        <div className="sticky top-8">
          <h3 className="font-semibold mb-4">Your Progress</h3>
          <div className="space-y-2">
            {steps.map((step) => (
              <OnboardingStep
                key={step.id}
                step={step}
                isActive={step.id === currentStep}
                isCompleted={step.id < currentStep}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardContent className="pt-8 pb-12 px-8">
            {renderStepContent()}

            <div className="flex items-center justify-between mt-8">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={currentStep === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="flex gap-2">
                {currentStep < steps.length && (
                  <Button variant="ghost" onClick={handleComplete}>
                    Skip
                  </Button>
                )}
                <Button onClick={handleNext} disabled={isLoading}>
                  {currentStep === steps.length ? (
                    "Get Started"
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
