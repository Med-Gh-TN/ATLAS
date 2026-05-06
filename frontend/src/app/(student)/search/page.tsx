"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  FileText,
  Search,
  Star,
  GraduationCap,
} from "lucide-react";
import { useRef, useState } from "react";
import type { SearchParams } from "@/types/api.types";
import { MaterialSelectionDialog } from "@/components/course/material-selection-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { isSearchQueryEnabled, useSearchQuery } from "@/queries";
import { useRegistrationOptionsQuery } from "@/queries/auth";
import { useTranslation } from "@/hooks/use-translation";

export default function SearchPage() {
  const { t, tSection } = useTranslation();
  const searchT = tSection("search");
  
  const [query, setQuery] = useState("");
  const [filiere, setFiliere] = useState("all");
  const [niveau, setNiveau] = useState("all");
  const [typeCours, setTypeCours] = useState("all");
  const [selectedCourse, setSelectedCourse] = useState<{id: string, title: string} | null>(null);

  const { data: options } = useRegistrationOptionsQuery();
  const filieres = options?.departments.map(d => d.name) || [];
  const levels = options?.levels || [];

  const searchParams: SearchParams = {
    q: query.trim() || undefined,
    filiere: filiere !== "all" ? filiere : undefined,
    niveau: niveau !== "all" ? niveau : undefined,
    type: typeCours !== "all" ? typeCours : undefined,
  };

  const {
    data: searchResults,
    isLoading,
    isError,
    error,
    isFetched,
  } = useSearchQuery(searchParams);
  const results = searchResults?.items ?? [];
  const searchEnabled = isSearchQueryEnabled(searchParams);

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 5,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{searchT.searchAtlas}</h1>
      </div>

      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-1">
            <div className="relative">
              <Search className="absolute inset-inline-start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchT.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="ps-10"
              />
            </div>
          </div>
          <Select value={filiere} onValueChange={setFiliere}>
            <SelectTrigger>
              <SelectValue placeholder={searchT.department} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{searchT.allDepartments}</SelectItem>
              {filieres.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={niveau} onValueChange={setNiveau}>
            <SelectTrigger>
              <SelectValue placeholder={searchT.level} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{searchT.allLevels}</SelectItem>
              {levels.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeCours} onValueChange={setTypeCours}>
            <SelectTrigger>
              <SelectValue placeholder={searchT.type} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{searchT.allTypes}</SelectItem>
              <SelectItem value="Lecture">{searchT.lecture}</SelectItem>
              <SelectItem value="TD">{searchT.td}</SelectItem>
              <SelectItem value="Exam">{searchT.exam}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isError ? (
        <EmptyState
          type="error"
          title={searchT.searchFailed}
          description={
            error instanceof Error
              ? error.message
              : searchT.couldNotLoadResults
          }
        />
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : results.length ? (
        <div
          ref={parentRef}
          className="h-[calc(100vh-320px)] overflow-auto rounded-lg border bg-muted/30"
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const result = results[virtualItem.index];
              if (!result) return null;
              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    insetInlineStart: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className="pb-4"
                >
                  <Card 
                    className="transition-all hover:bg-muted/50 h-full overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-lg active:scale-[0.99]"
                    onClick={() => {
                      if (result.course_id) {
                        setSelectedCourse({ id: result.course_id, title: result.title });
                      }
                    }}
                  >
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
                                {searchT.official}
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
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              {(result.quality_score ?? 0).toFixed(1)}
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
      ) : searchEnabled && isFetched ? (
        <EmptyState
          type="no-results"
          title={searchT.noResultsFound}
          description={searchT.tryAdjustingFilters}
        />
      ) : (
        <EmptyState
          type="search"
          title={searchT.searchAtlas}
          description={searchT.enterMinChars}
        />
      )}

      <MaterialSelectionDialog
        isOpen={!!selectedCourse}
        courseId={selectedCourse?.id || null}
        courseTitle={selectedCourse?.title}
        onClose={() => setSelectedCourse(null)}
      />
    </div>
  );
}
