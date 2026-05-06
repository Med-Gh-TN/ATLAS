/**
 * @file frontend/src/components/course/material-selection-dialog.tsx
 * @description Material Selection Modal. Multi-document payload selection wired to Next.js Router.
 * @layer Core Logic
 * @dependencies Next.js useRouter, lucide-react, Radix UI
 */

"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Search, 
  FileText, 
  User as UserIcon, 
  Calendar, 
  ChevronRight, 
  FileType, 
  Clock,
  ExternalLink,
  GraduationCap,
  ArrowLeft,
  FolderOpen,
  Sparkles
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCourseVersionsQuery } from "@/queries/courses";
import { formatDistanceToNow } from "date-fns";
import type { CourseVersion } from "@/types/api.types";

interface MaterialSelectionDialogProps {
  courseId: string | null;
  courseTitle?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ExtendedCourseVersion extends CourseVersion {
  uploader_name?: string;
  course_type?: string;
  language?: string;
  title?: string;
  academic_year?: string;
}

export function MaterialSelectionDialog({ 
  courseId, 
  courseTitle, 
  isOpen, 
  onClose 
}: MaterialSelectionDialogProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  
  const { data: queryData, isLoading } = useCourseVersionsQuery(courseId || "");
  
  // SOTA FIX: Safely cast to 'any' to bypass strict TS typing of the old hook.
  // This handles both the new API shape { items: [...] } and the old flat array.
  const rawData = queryData as any;
  const versions = rawData?.items ? rawData.items : (Array.isArray(rawData) ? rawData : []);

  // Filter by search
  const searchedVersions = useMemo(() => {
    if (!versions) return [];
    const query = searchQuery.toLowerCase();
    return (versions as ExtendedCourseVersion[]).filter(v => 
      v.title?.toLowerCase().includes(query) ||
      v.course_type?.toLowerCase().includes(query) ||
      v.uploader_name?.toLowerCase().includes(query)
    );
  }, [versions, searchQuery]);

  // Group by Year
  const groupedByYear = useMemo(() => {
    const groups: Record<string, ExtendedCourseVersion[]> = {};
    searchedVersions.forEach(v => {
      const year = v.academic_year || "Unknown Year";
      if (!groups[year]) groups[year] = [];
      groups[year].push(v);
    });
    return groups;
  }, [searchedVersions]);

  // If a year is selected, group those by Type (Lecture, TD, TP)
  const groupedByType = useMemo(() => {
    if (!selectedYear) return {};
    const yearVersions = groupedByYear[selectedYear] || [];
    const groups: Record<string, ExtendedCourseVersion[]> = {};
    yearVersions.forEach(v => {
      const type = v.course_type || "OTHER";
      if (!groups[type]) groups[type] = [];
      groups[type].push(v);
    });
    return groups;
  }, [selectedYear, groupedByYear]);

  // Handle closing modal and resetting state
  const handleClose = () => {
    setSearchQuery("");
    setSelectedYear(null);
    onClose();
  };

  // Trigger Multi-Doc Interaction (Year Level)
  const handleInteractWithYear = () => {
    if (!courseId || !selectedYear) return;
    const yearFiles = groupedByYear[selectedYear] || [];
    const versionIds = yearFiles.map(f => f.id).join(',');
    
    handleClose();
    // Using `versions=` array format for the parent course page to parse and API submit
    router.push(`/courses/${courseId}?versions=${versionIds}`);
  };

  // Trigger Multi-Doc Interaction (Category/Type Level)
  const handleInteractWithType = (typeFiles: ExtendedCourseVersion[]) => {
    if (!courseId || typeFiles.length === 0) return;
    const versionIds = typeFiles.map(f => f.id).join(',');
    
    handleClose();
    router.push(`/courses/${courseId}?versions=${versionIds}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl gap-0 p-0 overflow-hidden shadow-2xl border-none glass-dark">
        <DialogHeader className="p-6 pb-4 border-b bg-muted/30">
          <div className="flex items-center gap-3 mb-1">
            {selectedYear ? (
              <Button 
                variant="ghost" 
                size="icon" 
                className="mr-2" 
                onClick={() => setSelectedYear(null)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <GraduationCap className="h-6 w-6 text-primary" />
              </div>
            )}
            <div>
              <DialogTitle className="text-xl">
                {courseTitle || "Select Course Material"}
                {selectedYear && <span className="text-muted-foreground ml-2">({selectedYear})</span>}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {selectedYear 
                  ? "Select a specific file, or interact with an entire category." 
                  : "Browse and select the academic year to start learning."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter by title, type (TD, Lecture), or teacher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-background/50 border-muted-foreground/20"
            />
          </div>
        </div>

        <ScrollArea className="max-h-[60vh] bg-background/30">
          <div className="p-6 space-y-4">
            {isLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-xl border bg-muted/50 animate-pulse" />
              ))
            ) : !selectedYear ? (
              /* VIEW 1: SELECT ACADEMIC YEAR */
              Object.entries(groupedByYear).length === 0 ? (
                <div className="py-12 text-center">
                  <FolderOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">No academic years found.</p>
                </div>
              ) : (
                Object.entries(groupedByYear)
                  .sort(([yearA], [yearB]) => yearB.localeCompare(yearA))
                  .map(([year, files]) => (
                    <div 
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      className="group flex items-center justify-between p-5 rounded-xl border bg-card/50 hover:bg-accent hover:border-primary/50 cursor-pointer transition-all hover:shadow-md"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Calendar className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{year}</h3>
                          <p className="text-sm text-muted-foreground">{files.length} materials available</p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                ))
              )
            ) : (
              /* VIEW 2: CATEGORIES & FILES INSIDE YEAR */
              <div className="space-y-8">
                {/* Year-Level Synthesis Action */}
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Interact with {selectedYear}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">Generate exams or chat with all materials in this year combined.</p>
                  </div>
                  <Button variant="default" size="sm" onClick={handleInteractWithYear}>
                    Select All
                  </Button>
                </div>

                {Object.entries(groupedByType).map(([type, files]) => (
                  <div key={type} className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        {type} <span className="bg-muted px-2 py-0.5 rounded-full text-xs">{files.length}</span>
                      </h3>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="h-7 text-xs" 
                        onClick={() => handleInteractWithType(files)}
                      >
                        Interact with all {type}s
                      </Button>
                    </div>

                    <div className="grid gap-3">
                      {files.map((version) => (
                        <Link
                          key={version.id}
                          // Maintains backwards compat, but standardizes on the 'versions=' query
                          href={`/courses/${courseId}?versions=${version.id}`}
                          onClick={handleClose}
                          className="group block"
                        >
                          <div className="flex items-center gap-4 rounded-xl border bg-card/50 p-4 transition-all hover:bg-accent hover:border-primary/50 hover:shadow-md">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                              <FileType className="h-5 w-5" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-sm truncate">
                                {version.title || `Document v${version.version_number}`}
                              </h4>
                              
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <UserIcon className="h-3 w-3" />
                                  <span className="truncate max-w-[120px]">{version.uploader_name}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{formatDistanceToNow(new Date(version.uploaded_at))} ago</span>
                                </div>
                                <div className="flex items-center gap-1 font-mono bg-muted/50 px-1.5 rounded">
                                  v{version.version_number}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                              <Button size="sm" variant="secondary" className="h-8">
                                Open
                              </Button>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}