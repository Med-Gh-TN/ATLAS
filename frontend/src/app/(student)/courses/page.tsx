"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  Search,
  Filter,
  BookOpen,
  Users,
  Star,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useCoursesQuery } from "@/queries";

const FILIERES = [
  "All",
  "Informatique",
  "Mathematiques",
  "Physique",
  "Chimie",
  "Biologie",
  "Economie",
  "Droit",
];

const LEVELS = ["All", "L1", "L2", "L3", "M1", "M2"];

export default function CoursesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filiere, setFiliere] = useState("All");
  const [level, setLevel] = useState("All");

  const { data: courses, isLoading } = useCoursesQuery();

  const filteredCourses = courses?.filter((course) => {
    const matchesSearch =
      search === "" ||
      course.title.toLowerCase().includes(search.toLowerCase());
    const matchesFiliere = filiere === "All" || course.filiere === filiere;
    const matchesLevel = level === "All" || course.level === level;
    return matchesSearch && matchesFiliere && matchesLevel;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Course Catalog</h1>
        <p className="text-muted-foreground">
          Browse and explore available courses
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={filiere}
          onChange={(e) => setFiliere(e.target.value)}
          className="w-full sm:w-40"
        >
          {FILIERES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <Select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="w-full sm:w-32"
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredCourses?.length === 0 ? (
        <EmptyState
          type="no-results"
          title="No courses found"
          description="Try adjusting your search or filters"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourses?.map((course) => (
            <Link key={course.id} href={`/courses/${course.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <GraduationCap className="h-5 w-5 text-primary" />
                    </div>
                    {course.course_type && (
                      <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium">
                        {course.course_type}
                      </span>
                    )}
                  </div>
                  <CardTitle className="mt-3 line-clamp-2">
                    {course.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {course.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {course.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {course.filiere && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {course.filiere}
                      </span>
                    )}
                    {course.level && (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {course.level}
                      </span>
                    )}
                    {course.language && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {course.language}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
