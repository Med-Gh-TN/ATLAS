"use client";

import { useState } from "react";
import {
  BookOpen,
  Search,
  MoreVertical,
  Plus,
  Edit,
  Trash2,
  Eye,
  Users,
  Download,
  ChevronLeft,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusChip } from "@/components/ui/status-chip";

const mockCourses = [
  {
    id: 1,
    title: "Mathematics Fundamentals",
    code: "MATH101",
    filiere: "Computer Science",
    level: "L1",
    students: 125,
    teachers: 3,
    status: "active",
    quality: 92,
  },
  {
    id: 2,
    title: "Physics for Engineers",
    code: "PHYS201",
    filiere: "Engineering",
    level: "L2",
    students: 89,
    teachers: 2,
    status: "active",
    quality: 88,
  },
  {
    id: 3,
    title: "Introduction to Programming",
    code: "CS101",
    filiere: "Computer Science",
    level: "L1",
    students: 156,
    teachers: 4,
    status: "active",
    quality: 95,
  },
  {
    id: 4,
    title: "Data Structures",
    code: "CS201",
    filiere: "Computer Science",
    level: "L2",
    students: 78,
    teachers: 2,
    status: "draft",
    quality: 0,
  },
  {
    id: 5,
    title: "Calculus I",
    code: "MATH201",
    filiere: "Mathematics",
    level: "L1",
    students: 112,
    teachers: 3,
    status: "active",
    quality: 85,
  },
  {
    id: 6,
    title: "Linear Algebra",
    code: "MATH202",
    filiere: "Mathematics",
    level: "L1",
    students: 95,
    teachers: 2,
    status: "archived",
    quality: 78,
  },
  {
    id: 7,
    title: "Organic Chemistry",
    code: "CHEM301",
    filiere: "Chemistry",
    level: "L3",
    students: 67,
    teachers: 2,
    status: "active",
    quality: 90,
  },
  {
    id: 8,
    title: "Modern History",
    code: "HIST101",
    filiere: "Arts",
    level: "L1",
    students: 143,
    teachers: 4,
    status: "active",
    quality: 82,
  },
];

export default function AdminCourses() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [filiereFilter, setFiliereFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const filieres = [...new Set(mockCourses.map((c) => c.filiere))];

  const filteredCourses = mockCourses.filter((course) => {
    const matchesSearch =
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || course.status === statusFilter;
    const matchesFiliere =
      filiereFilter === "all" || course.filiere === filiereFilter;
    return matchesSearch && matchesStatus && matchesFiliere;
  });

  const totalPages = Math.ceil(filteredCourses.length / itemsPerPage);
  const paginatedCourses = filteredCourses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Course Management</h1>
          <p className="text-muted-foreground">
            Overview and management of all platform courses
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Course
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{mockCourses.length}</p>
            <p className="text-sm text-muted-foreground">Total Courses</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">
              {mockCourses.filter((c) => c.status === "active").length}
            </p>
            <p className="text-sm text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-500">
              {mockCourses.reduce((acc, c) => acc + c.students, 0)}
            </p>
            <p className="text-sm text-muted-foreground">Total Students</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-500">
              {Math.round(
                mockCourses.reduce((acc, c) => acc + c.quality, 0) /
                  mockCourses.filter((c) => c.quality > 0).length,
              )}
              %
            </p>
            <p className="text-sm text-muted-foreground">Avg. Quality</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border bg-background px-4 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={filiereFilter}
          onChange={(e) => setFiliereFilter(e.target.value)}
          className="rounded-lg border bg-background px-4 py-2 text-sm"
        >
          <option value="all">All Filieres</option>
          {filieres.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Course
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Filiere
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Students
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Teachers
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium">
                    Quality
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedCourses.map((course) => (
                  <tr key={course.id} className="border-b">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <BookOpen className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{course.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {course.code} • {course.level}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{course.filiere}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {course.students}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{course.teachers}</td>
                    <td className="px-4 py-3">
                      <StatusChip status={course.status} />
                    </td>
                    <td className="px-4 py-3">
                      {course.quality > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${course.quality}%` }}
                            />
                          </div>
                          <span className="text-sm">{course.quality}%</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <BarChart3 className="mr-2 h-4 w-4" />
                            Analytics
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit Course
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(currentPage * itemsPerPage, filteredCourses.length)} of{" "}
            {filteredCourses.length} courses
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
    </div>
  );
}
