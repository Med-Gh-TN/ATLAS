"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  Search,
  Filter,
  FileText,
  Star,
  TrendingUp,
  Award,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useSearchQuery } from "@/queries";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { SearchParams } from "@/types/api.types";

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
const NIVEAUX = ["All", "L1", "L2", "L3", "M1", "M2"];
const TYPES = ["All", "Cours", "TD", "TP", "Examen", "Corrige"];

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filiere, setFiliere] = useState("");
  const [niveau, setNiveau] = useState("");
  const [typeCours, setTypeCours] = useState("");

  const searchParams: SearchParams = {
    q: query || undefined,
    filiere: filiere || undefined,
    niveau: niveau || undefined,
    type: typeCours || undefined,
  };

  const { data: results, isLoading, isFetching } = useSearchQuery(searchParams);

  const listRef = useRef<HTMLDivElement>(null);

  const virtualizer = useWindowVirtualizer({
    count: results?.items?.length || 0,
    estimateSize: () => 120, // estimated height of each card
    overscan: 5,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-muted-foreground">
          Find documents, courses, and resources
        </p>
      </div>

      <form onSubmit={handleSearch} className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search for courses, documents, topics..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit">Search</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select
            value={filiere}
            onChange={(e) => setFiliere(e.target.value)}
            className="w-40"
          >
            <option value="">All Filieres</option>
            {FILIERES.filter((f) => f !== "All").map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
          <Select
            value={niveau}
            onChange={(e) => setNiveau(e.target.value)}
            className="w-32"
          >
            <option value="">All Levels</option>
            {NIVEAUX.filter((l) => l !== "All").map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
          <Select
            value={typeCours}
            onChange={(e) => setTypeCours(e.target.value)}
            className="w-32"
          >
            <option value="">All Types</option>
            {TYPES.filter((t) => t !== "All").map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          {(filiere || niveau || typeCours) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFiliere("");
                setNiveau("");
                setTypeCours("");
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </form>

      {isLoading || isFetching ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : results?.items?.length === 0 ? (
        <EmptyState
          type="no-results"
          title="No results found"
          description="Try different search terms or filters"
        />
      ) : results ? (
        <div className="space-y-4" ref={listRef}>
          <p className="text-sm text-muted-foreground">
            Found {results.meta?.total || 0} result
            {results.meta?.total !== 1 ? "s" : ""}
          </p>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const result = results.items[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className="pb-4"
                >
                  <Card className="transition-colors hover:bg-muted/50 h-full overflow-hidden">
                    <CardContent className="pt-4 h-full">
                      <div className="flex gap-4 h-full">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold line-clamp-1">
                              {result.title}
                            </h3>
                            {result.is_official && (
                              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                                Official
                              </span>
                            )}
                          </div>
                          {result.snippet && (
                            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                              {result.snippet}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {result.teacher_name && (
                              <span className="flex items-center gap-1">
                                <GraduationCap className="h-3 w-3" />
                                {result.teacher_name}
                              </span>
                            )}
                            {result.filiere && <span>{result.filiere}</span>}
                            {result.tags?.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="rounded bg-muted px-1.5 py-0.5"
                              >
                                {tag}
                              </span>
                            ))}
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              {result.quality_score.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          type="search"
          title="Search ATLAS"
          description="Enter a search term to find documents and courses"
        />
      )}
    </div>
  );
}
