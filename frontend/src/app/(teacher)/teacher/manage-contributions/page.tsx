"use client";

import { useState } from "react";
import {
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Filter,
  Eye,
  FileText,
  BookOpen,
  MessageSquare,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const mockContributions = [
  {
    id: 1,
    title: "Chapter 5 Quiz - Mathematics",
    type: "quiz",
    author: "Ahmed Ben Ali",
    authorEmail: "ahmed.benali@atlas.tn",
    filiere: "Computer Science",
    level: "L1",
    status: "pending",
    date: "2 hours ago",
    description: "20-question quiz covering derivatives and integrals",
  },
  {
    id: 2,
    title: "Flashcard Deck: Physics Formulas",
    type: "flashcard",
    author: "Fatma Trabelsi",
    authorEmail: "fatma.trabelsi@atlas.tn",
    filiere: "Engineering",
    level: "L2",
    status: "pending",
    date: "5 hours ago",
    description: "50 flashcards covering Newton's laws and thermodynamics",
  },
  {
    id: 3,
    title: "Course Summary: History 101",
    type: "summary",
    author: "Mohamed Hedi",
    authorEmail: "mohamed.hedi@atlas.tn",
    filiere: "Arts",
    level: "L1",
    status: "rejected",
    date: "1 day ago",
    description: "Comprehensive summary of ancient civilizations",
    rejectionReason:
      "Contains factual errors in section 3. Please review and resubmit.",
  },
  {
    id: 4,
    title: "Mind Map: Biology Cell Division",
    type: "mindmap",
    author: "Sarra Mansour",
    authorEmail: "sarra.mansour@atlas.tn",
    filiere: "Biology",
    level: "L1",
    status: "pending",
    date: "1 day ago",
    description: "Visual mind map of mitosis and meiosis processes",
  },
  {
    id: 5,
    title: "Quiz: Introduction to Programming",
    type: "quiz",
    author: "Youssef Salah",
    authorEmail: "youssef.salah@atlas.tn",
    filiere: "Computer Science",
    level: "L1",
    status: "approved",
    date: "2 days ago",
    description: "15-question quiz covering basic programming concepts",
  },
  {
    id: 6,
    title: "Flashcard Deck: Chemistry Elements",
    type: "flashcard",
    author: "Nadia Khelifi",
    authorEmail: "nadia.khelifi@atlas.tn",
    filiere: "Chemistry",
    level: "L1",
    status: "pending",
    date: "2 days ago",
    description: "30 flashcards for periodic table elements",
  },
];

const typeIcons: Record<string, typeof BookOpen> = {
  quiz: FileText,
  flashcard: BookOpen,
  summary: FileText,
  mindmap: FileText,
};

const typeLabels: Record<string, string> = {
  quiz: "Quiz",
  flashcard: "Flashcards",
  summary: "Summary",
  mindmap: "Mind Map",
};

export default function ManageContributions() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedContribution, setSelectedContribution] = useState<
    (typeof mockContributions)[0] | null
  >(null);
  const [reviewNote, setReviewNote] = useState("");
  const itemsPerPage = 5;

  const filteredContributions = mockContributions.filter((contribution) => {
    const matchesSearch =
      contribution.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contribution.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType =
      typeFilter === "all" || contribution.type === typeFilter;
    const matchesStatus =
      statusFilter === "all" || contribution.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const totalPages = Math.ceil(filteredContributions.length / itemsPerPage);
  const paginatedContributions = filteredContributions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const pendingCount = mockContributions.filter(
    (c) => c.status === "pending",
  ).length;

  const handleApprove = () => {
    console.log("Approved:", selectedContribution?.id, "Note:", reviewNote);
    setSelectedContribution(null);
    setReviewNote("");
  };

  const handleReject = () => {
    console.log("Rejected:", selectedContribution?.id, "Reason:", reviewNote);
    setSelectedContribution(null);
    setReviewNote("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manage Contributions</h1>
          <p className="text-muted-foreground">
            Review and approve student-submitted content
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-amber-100 px-4 py-2 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <Clock className="h-5 w-5" />
          <span className="font-medium">{pendingCount} pending reviews</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contributions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border bg-background px-4 py-2 text-sm"
        >
          <option value="all">All Types</option>
          <option value="quiz">Quiz</option>
          <option value="flashcard">Flashcards</option>
          <option value="summary">Summary</option>
          <option value="mindmap">Mind Map</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border bg-background px-4 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="grid gap-4">
        {paginatedContributions.map((contribution) => {
          const TypeIcon = typeIcons[contribution.type] || FileText;
          return (
            <Card key={contribution.id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <TypeIcon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{contribution.title}</h3>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          {typeLabels[contribution.type]}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        by {contribution.author} • {contribution.filiere} •{" "}
                        {contribution.level} • {contribution.date}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip status={contribution.status} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedContribution(contribution)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Review
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(currentPage * itemsPerPage, filteredContributions.length)}{" "}
            of {filteredContributions.length} contributions
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={!!selectedContribution}
        onOpenChange={() => setSelectedContribution(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Contribution</DialogTitle>
          </DialogHeader>
          {selectedContribution && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold">{selectedContribution.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  by {selectedContribution.author} (
                  {selectedContribution.authorEmail})
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {typeLabels[selectedContribution.type]}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {selectedContribution.filiere} •{" "}
                    {selectedContribution.level}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-medium">Description</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedContribution.description}
                </p>
              </div>

              {selectedContribution.rejectionReason && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <h4 className="font-medium text-destructive">
                    Rejection Reason
                  </h4>
                  <p className="mt-1 text-sm">
                    {selectedContribution.rejectionReason}
                  </p>
                </div>
              )}

              <div>
                <label className="font-medium">Review Note</label>
                <Textarea
                  placeholder="Add a note for the contributor..."
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="mt-2"
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Download className="h-4 w-4" />
                <span>Preview and download options available</span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={selectedContribution?.status !== "pending"}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button
              onClick={handleApprove}
              disabled={selectedContribution?.status !== "pending"}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
