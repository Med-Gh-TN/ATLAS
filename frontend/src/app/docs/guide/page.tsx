"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  GraduationCap,
  BookOpen,
  Users,
  Settings,
  BarChart3,
  Search,
  Upload,
  FileText,
  MessageSquare,
  Bell,
  Trophy,
  Sparkles,
  Play,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  BookMarked,
  Video,
  Layers,
  Rocket,
  Shield,
  Key,
  CreditCard,
  Link2,
  ExternalLink,
  Copy,
  Check,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTranslation } from "@/hooks/use-translation";
import { useUIStore } from "@/store/auth.store";

interface GuideSection {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  subsections?: { id: string; title: string; content: React.ReactNode }[];
}

const guideData: Record<string, GuideSection> = {
  onboarding: {
    id: "onboarding",
    title: "Getting Started",
    description: "Set up your account and workspace",
    icon: <Rocket className="h-5 w-5" />,
    subsections: [
      {
        id: "account-setup",
        title: "Account Setup",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">Creating Your Account</h3>
              <p className="mt-2 text-muted-foreground">
                Visit the registration page and choose your role to get started with Atlas.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/50 p-4">
              <ol className="list-decimal list-inside space-y-3 text-sm">
                <li>Navigate to <strong>/auth/register</strong></li>
                <li>Enter your email and create a strong password</li>
                <li>Select your role: <strong>Student</strong>, <strong>Teacher</strong>, or <strong>Admin</strong></li>
                <li>Verify your email address</li>
                <li>Complete your profile with your academic information</li>
              </ol>
            </div>
            <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="font-medium">Pro Tip</p>
                  <p className="text-sm text-muted-foreground">
                    Use your institutional email (.tn domain) for automatic school verification.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "dashboard-overview",
        title: "Dashboard Overview",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">Understanding Your Dashboard</h3>
              <p className="mt-2 text-muted-foreground">
                Your dashboard is your mission control. Here's what you'll find:
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-blue-500" />
                  <span className="font-medium">Continue Learning</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Quick access to your in-progress courses
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-orange-500" />
                  <span className="font-medium">Study Streak</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your daily learning consistency
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-purple-500" />
                  <span className="font-medium">Notifications</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Alerts for new content and updates
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-green-500" />
                  <span className="font-medium">AI Assistant</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generate summaries, flashcards, quizzes
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "rbac",
        title: "Role-Based Access",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">Understanding Roles</h3>
              <p className="mt-2 text-muted-foreground">
                Atlas has four main roles, each with different permissions:
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 text-left">Role</th>
                    <th className="pb-2 text-left">Can View</th>
                    <th className="pb-2 text-left">Can Upload</th>
                    <th className="pb-2 text-left">Can Moderate</th>
                    <th className="pb-2 text-left">Can Admin</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 font-medium">Student</td>
                    <td className="py-2">Courses</td>
                    <td className="py-2">Contributions</td>
                    <td className="py-2 text-muted-foreground">—</td>
                    <td className="py-2 text-muted-foreground">—</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 font-medium">Teacher</td>
                    <td className="py-2">All Content</td>
                    <td className="py-2">✓</td>
                    <td className="py-2">Student Uploads</td>
                    <td className="py-2 text-muted-foreground">—</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 font-medium">Admin</td>
                    <td className="py-2">All Content</td>
                    <td className="py-2">✓</td>
                    <td className="py-2">✓</td>
                    <td className="py-2">Users & Settings</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">Superadmin</td>
                    <td className="py-2">Everything</td>
                    <td className="py-2">✓</td>
                    <td className="py-2">✓</td>
                    <td className="py-2">Full Control</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ),
      },
    ],
  },
  tutorials: {
    id: "tutorials",
    title: "How-To Guides",
    description: "Step-by-step workflows for common tasks",
    icon: <BookOpen className="h-5 w-5" />,
    subsections: [
      {
        id: "find-courses",
        title: "Finding & Enrolling in Courses",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">Discover New Courses</h3>
              <p className="mt-2 text-muted-foreground">
                Follow these steps to find courses that match your learning goals:
              </p>
            </div>
            <div className="rounded-lg border bg-muted/50 p-4">
              <ol className="list-decimal list-inside space-y-4 text-sm">
                <li>
                  <span className="font-medium">Navigate to Courses</span>
                  <p className="mt-1 text-muted-foreground">
                    Go to <code className="rounded bg-muted px-1">/courses</code> from the main menu
                  </p>
                </li>
                <li>
                  <span className="font-medium">Use Filters</span>
                  <p className="mt-1 text-muted-foreground">
                    Filter by level (L1, L2, L3), department, or course type
                  </p>
                </li>
                <li>
                  <span className="font-medium">Search</span>
                  <p className="mt-1 text-muted-foreground">
                    Use the search bar to find specific topics
                  </p>
                </li>
                <li>
                  <span className="font-medium">Enroll</span>
                  <p className="mt-1 text-muted-foreground">
                    Click the course card and press <strong>Enroll</strong>
                  </p>
                </li>
              </ol>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Play className="h-4 w-4" />
              <span>Watch: Finding and enrolling in courses (45s video)</span>
            </div>
          </div>
        ),
      },
      {
        id: "use-ai",
        title: "Using AI Study Tools",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">AI-Powered Learning</h3>
              <p className="mt-2 text-muted-foreground">
                Generate flashcards, summaries, mind maps, and quizzes from any course:
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <Sparkles className="mb-2 h-6 w-6 text-blue-500" />
                <h4 className="font-medium">Summary</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Get AI-generated summaries of long course material
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <Layers className="mb-2 h-6 w-6 text-green-500" />
                <h4 className="font-medium">Mind Map</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Visual concept maps for better understanding
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <BookOpen className="mb-2 h-6 w-6 text-orange-500" />
                <h4 className="font-medium">Flashcards</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Spaced-repetition flashcards
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <CheckCircle2 className="mb-2 h-6 w-6 text-purple-500" />
                <h4 className="font-medium">Quiz</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Self-testing with multiple choice
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 className="font-medium text-blue-700">Accessing AI Tools</h4>
              <p className="mt-1 text-sm text-blue-600">
                Open any enrolled course → Click the <strong>AI Tools</strong> tab → Choose your tool
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "contribute",
        title: "Contributing Content",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">Share Your Knowledge</h3>
              <p className="mt-2 text-muted-foreground">
                Help the community by contributing your study materials:
              </p>
            </div>
            <div className="rounded-lg border bg-muted/50 p-4">
              <ol className="list-decimal list-inside space-y-4 text-sm">
                <li>
                  <span className="font-medium">Go to Upload</span>
                  <p className="mt-1 text-muted-foreground">
                    Navigate to <code className="rounded bg-muted px-1">/upload</code>
                  </p>
                </li>
                <li>
                  <span className="font-medium">Select File</span>
                  <p className="mt-1 text-muted-foreground">
                    Choose PDF, DOCX, or TXT files (max 50MB)
                  </p>
                </li>
                <li>
                  <span className="font-medium">Add Details</span>
                  <p className="mt-1 text-muted-foreground">
                    Title, description, level, and department
                  </p>
                </li>
                <li>
                  <span className="font-medium">Submit for Review</span>
                  <p className="mt-1 text-muted-foreground">
                    Teachers will review before publishing
                  </p>
                </li>
              </ol>
            </div>
            <div className="rounded-lg border-l-4 border-yellow-500 bg-yellow-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="font-medium">Content Guidelines</p>
                  <p className="text-sm text-muted-foreground">
                    All contributions are reviewed. Ensure proper attribution and no copyrighted material.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ),
      },
    ],
  },
  management: {
    id: "management",
    title: "Settings & Config",
    description: "Configure your account and preferences",
    icon: <Settings className="h-5 w-5" />,
    subsections: [
      {
        id: "profile",
        title: "Profile Settings",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">Managing Your Profile</h3>
              <p className="mt-2 text-muted-foreground">
                Update your personal information and preferences:
              </p>
            </div>
            <div className="rounded-lg border bg-muted/50 p-4">
              <ul className="space-y-3 text-sm">
                <li><code className="rounded bg-muted px-1">/settings</code> — Main profile settings</li>
                <li><code className="rounded bg-muted px-1">/settings#notifications</code> — Notification preferences</li>
                <li><code className="rounded bg-muted px-1">/settings#privacy</code> — Privacy controls</li>
                <li><code className="rounded bg-muted px-1">/settings#language</code> — Language & theme</li>
              </ul>
            </div>
          </div>
        ),
      },
      {
        id: "theme",
        title: "Language & Theme",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">Customize Your Experience</h3>
              <p className="mt-2 text-muted-foreground">
                Atlas supports English, French, and Arabic with RTL:
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-4 text-center">
                <span className="text-2xl">🇬🇧</span>
                <p className="mt-2 font-medium">English</p>
                <p className="text-sm text-muted-foreground">LTR</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <span className="text-2xl">🇫🇷</span>
                <p className="mt-2 font-medium">Français</p>
                <p className="text-sm text-muted-foreground">LTR</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <span className="text-2xl">🇹🇳</span>
                <p className="mt-2 font-medium">العربية</p>
                <p className="text-sm text-muted-foreground">RTL</p>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/50 p-4">
              <h4 className="font-medium">How to Change</h4>
              <ol className="mt-2 list-decimal list-inside text-sm text-muted-foreground">
                <li>Go to Settings → Language</li>
                <li>Select your preferred language</li>
                <li>Theme switches automatically (dark/light)</li>
              </ol>
            </div>
          </div>
        ),
      },
      {
        id: "notifications",
        title: "Notification Preferences",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">Control Your Alerts</h3>
              <p className="mt-2 text-muted-foreground">
                Choose how and when you want to be notified:
              </p>
            </div>
            <div className="space-y-3">
              {[
                { label: "Email Notifications", desc: "Daily digest and important updates" },
                { label: "Push Notifications", desc: "Real-time alerts in browser" },
                { label: "New Course Content", desc: "When courses you follow are updated" },
                { label: "Contributions Approved", desc: "When your uploads are published" },
                { label: "Study Reminders", desc: "Daily goals and streak reminders" },
                { label: "Leaderboard Updates", desc: "When you move up in rankings" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 rounded" />
                </div>
              ))}
            </div>
          </div>
        ),
      },
    ],
  },
  troubleshooting: {
    id: "troubleshooting",
    title: "Troubleshooting",
    description: "Fix common issues and get help",
    icon: <HelpCircle className="h-5 w-5" />,
    subsections: [
      {
        id: "errors",
        title: "Common Error Messages",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">What to Do When Things Go Wrong</h3>
              <p className="mt-2 text-muted-foreground">
                Here's how to fix the most common issues:
              </p>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <h4 className="font-medium text-red-700">"Session Expired"</h4>
                <p className="mt-1 text-sm text-red-600">Your login session has timed out.</p>
                <p className="mt-2 text-sm">→ Simply log out and log back in</p>
              </div>
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <h4 className="font-medium text-yellow-700">"Content Pending Review"</h4>
                <p className="mt-1 text-sm text-yellow-600">Your contribution is awaiting teacher approval.</p>
                <p className="mt-2 text-sm">→ This normally takes 24-48 hours</p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h4 className="font-medium text-blue-700">"File Too Large"</h4>
                <p className="mt-1 text-sm text-blue-600">Your upload exceeds the 50MB limit.</p>
                <p className="mt-2 text-sm">→ Split into smaller files or compress</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h4 className="font-medium text-gray-700">"No Network Connection"</h4>
                <p className="mt-1 text-sm text-gray-600">Cannot reach the Atlas servers.</p>
                <p className="mt-2 text-sm">→ Check your internet or try /offline page</p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "faq",
        title: "Frequently Asked Questions",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">Common Questions</h3>
              <p className="mt-2 text-muted-foreground">
                Quick answers to the most asked questions:
              </p>
            </div>
            <div className="space-y-4">
              {[
                { q: "How do I reset my password?", a: "Go to /auth/forgot-password and enter your email" },
                { q: "How do I delete my account?", a: "Contact your administrator or use Settings → Account → Delete" },
                { q: "Can I download courses for offline?", a: "Yes! Use the PWA app for offline access" },
                { q: "How are points calculated?", a: "Points = contributions + study time + quiz scores" },
                { q: "What happens to my streak if I miss a day?", a: "Streaks reset, but you can recover with 7-day bonus" },
                { q: "How do I report inappropriate content?", a: "Use the 'Report' button on any contribution" },
              ].map((faq) => (
                <div key={faq.q} className="rounded-lg border p-4">
                  <p className="font-medium">{faq.q}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        id: "support",
        title: "Getting Help",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">Support Channels</h3>
              <p className="mt-2 text-muted-foreground">
                If you can't find what you need, reach out:
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <MessageSquare className="h-6 w-6 text-blue-500" />
                <h4 className="mt-2 font-medium">Live Chat</h4>
                <p className="text-sm text-muted-foreground">
                  Available 9AM-6PM Tunisia time
                </p>
                <Button className="mt-3" size="sm">Start Chat</Button>
              </div>
              <div className="rounded-lg border p-4">
                <HelpCircle className="h-6 w-6 text-green-500" />
                <h4 className="mt-2 font-medium">Help Center</h4>
                <p className="text-sm text-muted-foreground">
                  Browse knowledge base articles
                </p>
                <Button variant="outline" className="mt-3" size="sm">Browse</Button>
              </div>
              <div className="rounded-lg border p-4">
                <ExternalLink className="h-6 w-6 text-purple-500" />
                <h4 className="mt-2 font-medium">Community Forum</h4>
                <p className="text-sm text-muted-foreground">
                  Connect with other students
                </p>
                <Button variant="outline" className="mt-3" size="sm">Visit</Button>
              </div>
              <div className="rounded-lg border p-4">
                <Mail className="h-6 w-6 text-orange-500" />
                <h4 className="mt-2 font-medium">Email Support</h4>
                <p className="text-sm text-muted-foreground">
                  support@atlas.tn
                </p>
                <Button variant="outline" className="mt-3" size="sm">Email</Button>
              </div>
            </div>
          </div>
        ),
      },
    ],
  },
  glossary: {
    id: "glossary",
    title: "Glossary",
    description: "Atlas terminology explained",
    icon: <BookMarked className="h-5 w-5" />,
    subsections: [
      {
        id: "terms",
        title: "Atlas Terms",
        content: (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">Understanding Atlas Vocabulary</h3>
              <p className="mt-2 text-muted-foreground">
                Here's what we mean when we say:
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { term: "Contribution", def: "Any study material (notes, slides, summaries) uploaded by students for the community" },
                { term: "Course", def: "A structured learning module with content, quizzes, and progress tracking" },
                { term: "Streak", def: "Number of consecutive days you've studied on Atlas" },
                { term: "Flashcard", def: "A spaced-repetition learning card with question and answer" },
                { term: "Mind Map", def: "Visual diagram showing concept relationships" },
                { term: "Pipeline", def: "The processing stages from upload to published content" },
                { term: "Trust Score", def: "User reputation based on contributions and activity" },
                { term: "Point", def: "Gamification currency earned through learning activities" },
              ].map((item) => (
                <div key={item.term} className="rounded-lg border p-3">
                  <p className="font-medium">{item.term}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.def}</p>
                </div>
              ))}
            </div>
          </div>
        ),
      },
    ],
  },
};

export default function UserGuidePage() {
  const { t, tSection } = useTranslation();
  const docsT = tSection("docs");
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  
  const [selectedSection, setSelectedSection] = useState("onboarding");
  const [selectedSubsection, setSelectedSubsection] = useState("account-setup");
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const currentSection = guideData[selectedSection];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Layers className="h-5 w-5" />
            </Button>
            <Link href="/" className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold">{docsT.userGuide}</span>
            </Link>
            <span className="hidden text-sm text-muted-foreground md:inline">
              atlas.tn/docs/guide
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden md:flex">
              <Search className="absolute inset-inline-start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={docsT.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 ps-9"
              />
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/api/docs">
                <BookOpen className="mr-2 h-4 w-4" />
                {docsT.apiDocs}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* Sidebar Navigation */}
        <aside
          className={`fixed inset-inline-start-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 transform overflow-y-auto border-r bg-background/50 px-4 py-6 transition-transform lg:relative lg:block lg:w-64 lg:border-r lg:bg-background lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"
          }`}
        >
          <nav className="space-y-1">
            {Object.values(guideData).map((section) => (
              <button
                key={section.id}
                onClick={() => {
                  setSelectedSection(section.id);
                  setSelectedSubsection(section.subsections?.[0].id || "");
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedSection === section.id
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-2">
                  {section.icon}
                  {t(`docs.${section.id}` as any)}
                </span>
                <ChevronRight className="h-4 w-4" />
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="flex h-[calc(100vh-4rem)]">
            {/* Subsection List */}
            <div className="w-72 overflow-y-auto border-r bg-muted/20 p-4">
              <h2 className="mb-4 text-lg font-semibold">{t(`docs.${currentSection?.id}` as any)}</h2>
              <div className="space-y-1">
                {currentSection?.subsections?.map((subsection) => (
                  <button
                    key={subsection.id}
                    onClick={() => setSelectedSubsection(subsection.id)}
                    className={`flex w-full items-center rounded-lg p-2 text-left text-sm transition-colors ${
                      selectedSubsection === subsection.id
                        ? "bg-blue-50 dark:bg-blue-950"
                        : "hover:bg-muted"
                    }`}
                  >
                    {subsection.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-3xl">
                {currentSection?.subsections?.map((subsection) => (
                  <div
                    key={subsection.id}
                    className={selectedSubsection === subsection.id ? "block" : "hidden"}
                  >
                    <h1 className="text-2xl font-bold">{subsection.title}</h1>
                    {subsection.content}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}