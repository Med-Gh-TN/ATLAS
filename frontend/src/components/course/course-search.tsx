"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCourseInstantSearch } from "@/queries/courses";
import { useTranslation } from "@/hooks/use-translation";
import type { InstantCourseResult } from "@/types/api.types";

export function CourseSearchInput() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query]);

  const { data: results, isLoading } = useCourseInstantSearch(debouncedQuery, {
    enabled: debouncedQuery.length >= 1,
  });

  // Ensure results is always an array for safe .length check
  const safeResults: InstantCourseResult[] = results ?? [];

  const handleSelect = useCallback((courseId: string) => {
    setIsOpen(false);
    setQuery("");
    setDebouncedQuery("");
    window.location.href = `/courses/${courseId}`;
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showDropdown = isOpen && query.length > 0 && (safeResults.length > 0 || isLoading);

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          placeholder={t("catalog.instantSearchPlaceholder")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.length >= 1) setIsOpen(true);
            else setIsOpen(false);
          }}
          onFocus={() => {
            if (query.length >= 1) setIsOpen(true);
          }}
          className="pl-10 pr-4"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && (
        <div
          ref={resultsRef}
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg"
        >
          {safeResults.length === 0 && !isLoading && (
            <p className="p-4 text-sm text-muted-foreground text-center">
              {t("search.noResultsFound")}
            </p>
          )}
          <ul className="max-h-64 overflow-auto py-1">
            {safeResults.map((course) => (
              <li
                key={course.course_id}
                className="cursor-pointer px-4 py-2 hover:bg-accent transition-colors"
                onClick={() => handleSelect(course.course_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSelect(course.course_id);
                }}
                tabIndex={0}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{course.title}</span>
                  <span className="text-xs text-muted-foreground">{course.level}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {course.department_name} · {course.academic_year}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}