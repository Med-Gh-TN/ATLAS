import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Search, Sparkles } from "lucide-react";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Explore",
  description: "Browse the ATLAS academic experience and jump into core study workflows.",
};

const exploreCards = [
  {
    title: "Courses",
    description: "Browse course collections, open readers, and start contextual study tools.",
    href: "/courses",
    icon: Search,
  },
  {
    title: "AI Workspace",
    description: "Use the unified AI workspace to chat, summarize, and generate study assets.",
    href: "/ai/workspace",
    icon: Sparkles,
  },
  {
    title: "Learning Paths",
    description: "Generate step-by-step academic roadmaps and track what to tackle next.",
    href: "/learning-path",
    icon: Compass,
  },
];

export default function ExplorePage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="max-w-2xl space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-blue-700">Explore ATLAS</p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Discover the platform surface before you dive deeper.</h1>
        <p className="text-base leading-7 text-slate-600">
          This page is statically regenerated and acts as the public discovery entrypoint required by the frontend contract.
        </p>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {exploreCards.map(({ title, description, href, icon: Icon }) => (
          <Link key={title} href={href} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <Icon className="mb-4 h-8 w-8 text-blue-700" />
            <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
