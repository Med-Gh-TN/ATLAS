import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BookOpen, Brain, GraduationCap, Layers3, Sparkles, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "ATLAS",
  description: "ATLAS helps students, teachers, and admins turn academic content into structured learning workflows.",
};

const highlights = [
  {
    title: "Course Intelligence",
    description: "Search, read, annotate, and explore course material with a coherent academic shell.",
    icon: BookOpen,
  },
  {
    title: "AI Workspace",
    description: "Chat, summary, flashcards, quizzes, and mind maps converge in one study flow.",
    icon: Brain,
  },
  {
    title: "Collaborative Learning",
    description: "Study groups, forums, contributions, and live sessions keep the platform connected.",
    icon: Users,
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <section className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2 text-slate-900">
            <GraduationCap className="h-6 w-6 text-blue-700" />
            <span className="text-lg font-semibold tracking-tight">ATLAS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/explore"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Explore
            </Link>
            <Link
              href="/auth/login"
              className="rounded-full bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800">
            <Sparkles className="h-4 w-4" />
            Coherent academic platform for students, teachers, and admins
          </div>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-slate-950">
              Turn courses into structured learning journeys with ATLAS.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              Search courses, read intelligently, generate study assets, collaborate in context, and manage academic workflows in one connected platform.
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Create Account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/ai/workspace"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-6 py-3 text-sm font-medium text-slate-800 transition hover:border-slate-400 hover:bg-white"
            >
              Open AI Workspace
              <Layers3 className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          {highlights.map(({ title, description, icon: Icon }) => (
            <div key={title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <Icon className="mb-4 h-8 w-8 text-blue-700" />
              <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
