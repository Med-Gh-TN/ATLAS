"use client";

import Link from "next/link";
import { GraduationCap, ArrowRight, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const posts = [
  {
    id: 1,
    title: "Introducing Atlas 2.0",
    excerpt: "New AI-powered study tools including mind maps and smart flashcards",
    date: "2026-04-15",
    author: "ATLAS Team",
    category: "Product",
  },
  {
    id: 2,
    title: "How AI is Transforming Education in Tunisia",
    excerpt: "Exploring the impact of intelligent tutoring systems",
    date: "2026-03-28",
    author: "Dr. Ahmed Ben Ali",
    category: "Education",
  },
  {
    id: 3,
    title: "Building the Open Source Atlas",
    excerpt: "Our journey to open source the learning platform",
    date: "2026-03-10",
    author: "ATLAS Team",
    category: "Engineering",
  },
];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Engineering Blog</h1>
          <p className="mt-2 text-muted-foreground">
            Stories about building Atlas and the future of education
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Card key={post.id} className="cursor-pointer hover:border-primary">
              <CardHeader>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                    {post.category}
                  </span>
                </div>
                <CardTitle className="mt-2">{post.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{post.excerpt}</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {post.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {post.author}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}