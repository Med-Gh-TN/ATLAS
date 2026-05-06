"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  Code,
  Key,
  Shield,
  Zap,
  Search,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Play,
  AlertCircle,
  Clock,
  Cpu,
  Globe,
  Terminal,
  FileJson,
  Rocket,
  Layers,
  MessageSquare,
  Users,
  GraduationCap,
  BarChart3,
  Settings,
  Database,
  Bell,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTranslation } from "@/hooks/use-translation";
import { useUIStore } from "@/store/auth.store";

interface Endpoint {
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, ResponseInfo>;
}

interface Parameter {
  name: string;
  in: string;
  required: boolean;
  type: string;
  description: string;
}

interface RequestBody {
  contentType: string;
  schema?: Record<string, any>;
  example?: Record<string, any>;
}

interface ResponseInfo {
  description: string;
  schema?: Record<string, any>;
  example?: Record<string, any>;
}

const endpointGroups: Record<string, Endpoint[]> = {
  "Getting Started": [
    {
      method: "GET",
      path: "/health",
      summary: "Health Check",
      description: "Satisfies container orchestration health probes and frontend checks.",
      tags: ["System"],
      responses: {
        "200": {
          description: "Service is healthy",
          example: { status: "active", version: "1.2.0-modular" },
        },
      },
    },
    {
      method: "GET",
      path: "/v1/openapi.json",
      summary: "OpenAPI Schema",
      description: "Returns the OpenAPI 3.0 specification in JSON format for AI agents and tooling.",
      tags: ["System"],
      responses: {
        "200": {
          description: "OpenAPI JSON schema",
        },
      },
    },
  ],
  Authentication: [
    {
      method: "POST",
      path: "/v1/auth/login",
      summary: "User Login",
      description: "Authenticate a user with email and password. Returns access and refresh tokens.",
      tags: ["Auth"],
      parameters: [
        { name: "email", in: "body", required: true, type: "string", description: "User email address" },
        { name: "password", in: "body", required: true, type: "string", description: "User password (min 8 chars)" },
      ],
      requestBody: {
        contentType: "application/json",
        schema: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
          },
          required: ["email", "password"],
        },
        example: { email: "student@atlas.tn", password: "securepassword123" },
      },
      responses: {
        "200": {
          description: "Login successful",
          example: {
            accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            user: {
              id: "uuid",
              email: "student@atlas.tn",
              role: "STUDENT",
              full_name: "Ahmed Ben Ali",
              is_active: true,
              is_verified: true,
            },
          },
        },
        "401": { description: "Invalid credentials" },
        "429": { description: "Too many requests - rate limited" },
      },
    },
    {
      method: "POST",
      path: "/v1/auth/register",
      summary: "User Registration",
      description: "Register a new user account. Requires email verification.",
      tags: ["Auth"],
      requestBody: {
        contentType: "application/json",
        example: {
          email: "newuser@atlas.tn",
          password: "securepassword123",
          full_name: "Mohamed Trabelsi",
          role: "STUDENT",
        },
      },
      responses: {
        "201": { description: "Account created, verification email sent" },
        "400": { description: "Validation error" },
        "409": { description: "Email already registered" },
      },
    },
    {
      method: "POST",
      path: "/v1/auth/refresh",
      summary: "Refresh Token",
      description: "Exchange refresh token for new access token.",
      tags: ["Auth"],
      requestBody: {
        contentType: "application/json",
        example: { refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
      },
      responses: {
        "200": { description: "New access token" },
        "401": { description: "Invalid or expired refresh token" },
      },
    },
    {
      method: "POST",
      path: "/v1/auth/logout",
      summary: "User Logout",
      description: "Invalidate the current session and refresh token.",
      tags: ["Auth"],
      responses: {
        "200": { description: "Logout successful" },
      },
    },
  ],
  Courses: [
    {
      method: "GET",
      path: "/v1/courses",
      summary: "List Courses",
      description: "Retrieve a paginated list of available courses with filtering and sorting options.",
      tags: ["Courses"],
      parameters: [
        { name: "page", in: "query", required: false, type: "integer", description: "Page number (default: 1)" },
        { name: "limit", in: "query", required: false, type: "integer", description: "Items per page (default: 20)" },
        { name: "level", in: "query", required: false, type: "string", description: "Filter by level (e.g., L1, L2, L3)" },
        { name: "search", in: "query", required: false, type: "string", description: "Search in title/description" },
        { name: "sort", in: "query", required: false, type: "string", description: "Sort field (newest, popular, rating)" },
      ],
      responses: {
        "200": {
          description: "Course list",
          example: {
            items: [
              {
                id: "uuid",
                title: "Introduction to Computer Networks",
                description: "Fundamentals of networking protocols...",
                level: "L2",
                enrolled_count: 245,
                average_rating: 4.5,
              },
            ],
            total: 150,
            page: 1,
            pages: 8,
          },
        },
      },
    },
    {
      method: "GET",
      path: "/v1/courses/{course_id}",
      summary: "Get Course Details",
      description: "Retrieve detailed information about a specific course including versions and metadata.",
      tags: ["Courses"],
      parameters: [
        { name: "course_id", in: "path", required: true, type: "string", description: "Course UUID" },
      ],
      responses: {
        "200": { description: "Course details" },
        "404": { description: "Course not found" },
      },
    },
    {
      method: "GET",
      path: "/v1/courses/{course_id}/content",
      summary: "Get Course Content",
      description: "Retrieve course material content, including text extraction and annotations.",
      tags: ["Courses"],
      responses: {
        "200": { description: "Course content" },
      },
    },
    {
      method: "GET",
      path: "/v1/courses/{course_id}/versions",
      summary: "List Course Versions",
      description: "Get all versions of a course with their pipeline status.",
      tags: ["Courses"],
      responses: {
        "200": { description: "Version list" },
      },
    },
  ],
  "AI Workspace": [
    {
      method: "POST",
      path: "/v1/rag/chat",
      summary: "AI Chat",
      description: "Chat with course content using RAG (Retrieval Augmented Generation).",
      tags: ["RAG"],
      parameters: [
        { name: "course_id", in: "body", required: true, type: "string", description: "Course to chat with" },
        { name: "message", in: "body", required: true, type: "string", description: "User message" },
      ],
      requestBody: {
        contentType: "application/json",
        example: {
          course_id: "uuid",
          message: "What are the main topics covered in chapter 3?",
        },
      },
      responses: {
        "200": {
          description: "AI response with sources",
          example: {
            answer: "Based on the course material, chapter 3 covers...",
            sources: [{ title: "Chapter 3", page: 45, snippet: "..." }],
          },
        },
      },
    },
    {
      method: "POST",
      path: "/v1/rag/summary",
      summary: "Generate Summary",
      description: "AI-powered summary of course content.",
      tags: ["RAG"],
      requestBody: {
        contentType: "application/json",
        example: { course_id: "uuid", max_length: 500 },
      },
      responses: {
        "200": { description: "Summary generated" },
      },
    },
    {
      method: "POST",
      path: "/v1/rag/mindmap",
      summary: "Generate Mind Map",
      description: "Generate an interactive mind map from course content.",
      tags: ["RAG"],
      requestBody: {
        contentType: "application/json",
        example: { course_id: "uuid" },
      },
      responses: {
        "200": { description: "Mind map data" },
      },
    },
    {
      method: "POST",
      path: "/v1/rag/flashcards",
      summary: "Generate Flashcards",
      description: "Generate spaced-repetition flashcards from course content.",
      tags: ["RAG"],
      requestBody: {
        contentType: "application/json",
        example: { course_id: "uuid", count: 20 },
      },
      responses: {
        "200": { description: "Flashcards generated" },
      },
    },
    {
      method: "POST",
      path: "/v1/rag/quiz",
      summary: "Generate Quiz",
      description: "Generate a quiz with multiple choice questions.",
      tags: ["RAG"],
      requestBody: {
        contentType: "application/json",
        example: { course_id: "uuid", count: 10 },
      },
      responses: {
        "200": { description: "Quiz generated" },
      },
    },
  ],
  Search: [
    {
      method: "GET",
      path: "/v1/search",
      summary: "Search Courses",
      description: "Full-text search across courses and contributions.",
      tags: ["Search"],
      parameters: [
        { name: "q", in: "query", required: true, type: "string", description: "Search query" },
        { name: "level", in: "query", required: false, type: "string", description: "Filter by level" },
        { name: "type", in: "query", required: false, type: "string", description: "Filter by type" },
      ],
      responses: {
        "200": { description: "Search results" },
      },
    },
    {
      method: "GET",
      path: "/v1/search/autocomplete",
      summary: "Autocomplete",
      description: "Fast search suggestions for the search bar.",
      tags: ["Search"],
      responses: {
        "200": { description: "Suggestions list" },
      },
    },
  ],
  Study: [
    {
      method: "GET",
      path: "/v1/study/flashcards",
      summary: "List Flashcard Decks",
      description: "Get all flashcard decks for the authenticated user.",
      tags: ["Study"],
      responses: {
        "200": { description: "Deck list" },
      },
    },
    {
      method: "POST",
      path: "/v1/study/flashcards/{deck_id}/review",
      summary: "Review Flashcard",
      description: "Record a flashcard review with SM-2 spaced repetition algorithm.",
      tags: ["Study"],
      requestBody: {
        contentType: "application/json",
        example: { card_id: "uuid", quality: 4 },
      },
      responses: {
        "200": { description: "Review recorded, next review date" },
      },
    },
    {
      method: "GET",
      path: "/v1/study/progress",
      summary: "Study Progress",
      description: "Get user's learning progress and analytics.",
      tags: ["Study"],
      responses: {
        "200": { description: "Progress data" },
      },
    },
    {
      method: "GET",
      path: "/v1/study/streaks",
      summary: "Study Streaks",
      description: "Get user's daily study streaks and motivation data.",
      tags: ["Study"],
      responses: {
        "200": { description: "Streak data" },
      },
    },
    {
      method: "GET",
      path: "/v1/study/calendar/ics",
      summary: "Study Calendar Export",
      description: "Export upcoming flashcard reviews as .ics calendar file for external calendar integration.",
      tags: ["Study"],
      responses: {
        "200": { description: "Calendar file download" },
      },
    },
  ],
  Contributions: [
    {
      method: "GET",
      path: "/v1/contributions",
      summary: "List Contributions",
      description: "Browse community contributions (courses, notes).",
      tags: ["Contributions"],
      responses: {
        "200": { description: "Contribution list" },
      },
    },
    {
      method: "POST",
      path: "/v1/contributions",
      summary: "Create Contribution",
      description: "Upload a new course or material for community review.",
      tags: ["Contributions"],
      requestBody: {
        contentType: "multipart/form-data",
        example: { title: "My Notes", description: "Chapter 1 notes" },
      },
      responses: {
        "201": { description: "Contribution submitted for review" },
      },
    },
    {
      method: "GET",
      path: "/v1/contributions/{id}",
      summary: "Get Contribution",
      description: "Get details of a specific contribution.",
      tags: ["Contributions"],
      responses: {
        "200": { description: "Contribution details" },
      },
    },
  ],
  Notifications: [
    {
      method: "GET",
      path: "/v1/notifications",
      summary: "List Notifications",
      description: "Get all notifications for the authenticated user.",
      tags: ["Notifications"],
      parameters: [
        { name: "unread_only", in: "query", required: false, type: "boolean", description: "Filter unread" },
      ],
      responses: {
        "200": { description: "Notification list" },
      },
    },
    {
      method: "POST",
      path: "/v1/notifications/{id}/read",
      summary: "Mark as Read",
      description: "Mark a notification as read.",
      tags: ["Notifications"],
      responses: {
        "200": { description: "Marked as read" },
      },
    },
    {
      method: "POST",
      path: "/v1/notifications/read-all",
      summary: "Mark All Read",
      description: "Mark all notifications as read.",
      tags: ["Notifications"],
      responses: {
        "200": { description: "All marked as read" },
      },
    },
  ],
  Admin: [
    {
      method: "GET",
      path: "/v1/admin/users",
      summary: "List Users",
      description: "Admin endpoint to list all users with filtering.",
      tags: ["Admin"],
      responses: {
        "200": { description: "User list" },
      },
    },
    {
      method: "GET",
      path: "/v1/admin/contributions",
      summary: "Moderation Queue",
      description: "Get pending contributions for review.",
      tags: ["Admin"],
      responses: {
        "200": { description: "Queue list" },
      },
    },
    {
      method: "POST",
      path: "/v1/admin/contributions/{id}/approve",
      summary: "Approve Contribution",
      description: "Approve a community contribution.",
      tags: ["Admin"],
      responses: {
        "200": { description: "Contribution approved" },
      },
    },
    {
      method: "POST",
      path: "/v1/admin/contributions/{id}/reject",
      summary: "Reject Contribution",
      description: "Reject a community contribution with reason.",
      tags: ["Admin"],
      responses: {
        "200": { description: "Contribution rejected" },
      },
    },
  ],
};

const methodColors: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  POST: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  PUT: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  PATCH: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function ApiDocsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [selectedGroup, setSelectedGroup] = useState("Getting Started");
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"code" | "try">("code");
  const [apiKey, setApiKey] = useState("");
  const [tryResponse, setTryResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { sidebarOpen, setSidebarOpen } = useUIStore();

  useEffect(() => {
    const group = searchParams.get("group");
    if (group && endpointGroups[group]) {
      setSelectedGroup(group);
    }
    const endpoint = searchParams.get("endpoint");
    if (endpoint) {
      for (const group of Object.values(endpointGroups)) {
        const found = group.find((e) => e.path === endpoint);
        if (found) {
          setSelectedEndpoint(found);
          break;
        }
      }
    }
  }, [searchParams]);

  const filteredGroups = Object.entries(endpointGroups).reduce((acc, [group, endpoints]) => {
    if (!searchQuery) {
      acc[group] = endpoints;
      return acc;
    }
    const filtered = endpoints.filter(
      (e) =>
        e.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.summary.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[group] = filtered;
    }
    return acc;
  }, {} as Record<string, Endpoint[]>);

  const copyToClipboard = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const executeRequest = async () => {
    if (!selectedEndpoint || !apiKey) return;
    setIsLoading(true);
    setTryResponse(null);

    try {
      const baseUrl = "http://127.0.0.1:8000";
      const response = await fetch(`${baseUrl}${selectedEndpoint.path}`, {
        method: selectedEndpoint.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      setTryResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setTryResponse(`Error: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const generateCodeSnippet = (endpoint: Endpoint, language: string) => {
    const url = `http://127.0.0.1:8000${endpoint.path}`;
    const headers = '{ "Authorization": "Bearer YOUR_API_KEY", "Content-Type": "application/json" }';

    switch (language) {
      case "curl":
        if (endpoint.method === "GET") {
          return `curl -X GET "${url}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`;
        }
        return `curl -X ${endpoint.method} "${url}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(endpoint.requestBody?.example || {}, null, 2)}'`;

      case "python":
        return `import requests

url = "${url}"
headers = ${headers}

response = requests.${endpoint.method.toLowerCase()}(url, headers=headers)
print(response.json())`;

      case "javascript":
        return `const response = await fetch("${url}", {
  method: "${endpoint.method}",
  headers: ${headers.replace(/'/g, '"')},
});

const data = await response.json();
console.log(data);`;

      default:
        return `# ${language} not supported`;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Layers className="h-5 w-5" />
            </Button>
            <Link href="/" className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold">{t("apiDocs.title")}</span>
            </Link>
            <span className="hidden text-sm text-muted-foreground md:inline">
              api.atlas.tn
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden md:flex">
              <Search className="absolute inset-inline-start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("apiDocs.searchEndpoints")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 ps-9"
              />
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href="/docs/openapi.json" target="_blank">
                <FileJson className="mr-2 h-4 w-4" />
                OpenAPI
              </a>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* Sidebar Navigation */}
        <aside
          className={`fixed inset-inline-start-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 transform overflow-y-auto border-r bg-background/50 px-4 py-6 transition-transform lg:relative lg:block lg:w-64 lg:border-r lg:bg-background lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"
          }`}
        >
          <nav className="space-y-1">
            {Object.keys(endpointGroups).map((group) => (
              <button
                key={group}
                onClick={() => {
                  setSelectedGroup(group);
                  setSelectedEndpoint(null);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedGroup === group
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-2">
                  {group === "Getting Started" && <Rocket className="h-4 w-4" />}
                  {group === "Authentication" && <Key className="h-4 w-4" />}
                  {group === "Courses" && <BookOpen className="h-4 w-4" />}
                  {group === "AI Workspace" && <Sparkles className="h-4 w-4" />}
                  {group === "Search" && <Search className="h-4 w-4" />}
                  {group === "Study" && <GraduationCap className="h-4 w-4" />}
                  {group === "Contributions" && <Users className="h-4 w-4" />}
                  {group === "Gamification" && <Trophy className="h-4 w-4" />}
                  {group === "Notifications" && <Bell className="h-4 w-4" />}
                  {group === "Admin" && <Shield className="h-4 w-4" />}
                  {t(`apiDocs.${group.charAt(0).toLowerCase() + group.slice(1).replace(/\s+/g, "")}` as any)}
                </span>
                {filteredGroups[group] && (
                  <span className="text-xs text-muted-foreground">
                    {filteredGroups[group].length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <div className="flex h-[calc(100vh-4rem)]">
            {/* Endpoint List */}
            <div className="w-80 overflow-y-auto border-r bg-muted/20 p-4">
              <h2 className="mb-4 text-lg font-semibold">{selectedGroup}</h2>
              <div className="space-y-2">
                {endpointGroups[selectedGroup]?.map((endpoint) => (
                  <button
                    key={`${endpoint.method}-${endpoint.path}`}
                    onClick={() => setSelectedEndpoint(endpoint)}
                    className={`flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm transition-colors ${
                      selectedEndpoint?.path === endpoint.path
                        ? "bg-blue-50 dark:bg-blue-950"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        methodColors[endpoint.method]
                      }`}
                    >
                      {endpoint.method}
                    </span>
                    <span className="flex-1 truncate font-mono text-xs">
                      {endpoint.path}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Documentation */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedEndpoint ? (
                <div className="space-y-6">
                  {/* Endpoint Header */}
                  <div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded px-2 py-1 text-sm font-medium ${
                          methodColors[selectedEndpoint.method]
                        }`}
                      >
                        {selectedEndpoint.method}
                      </span>
                      <h1 className="text-2xl font-bold">{selectedEndpoint.path}</h1>
                    </div>
                    <p className="mt-2 text-lg text-muted-foreground">
                      {selectedEndpoint.summary}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedEndpoint.description}
                    </p>
                    <div className="mt-2 flex gap-2">
                      {selectedEndpoint.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Parameters */}
                  {selectedEndpoint.parameters &&
                    selectedEndpoint.parameters.length > 0 && (
                      <div>
                        <h3 className="mb-3 text-lg font-semibold">Parameters</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="pb-2 text-left font-medium">Name</th>
                                <th className="pb-2 text-left font-medium">In</th>
                                <th className="pb-2 text-left font-medium">Type</th>
                                <th className="pb-2 text-left font-medium">Required</th>
                                <th className="pb-2 text-left font-medium">Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedEndpoint.parameters.map((param) => (
                                <tr key={param.name} className="border-b">
                                  <td className="py-2 font-mono">{param.name}</td>
                                  <td className="py-2 text-muted-foreground">
                                    {param.in}
                                  </td>
                                  <td className="py-2 font-mono">{param.type}</td>
                                  <td className="py-2">
                                    {param.required ? (
                                      <span className="text-red-500">Yes</span>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        No
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 text-muted-foreground">
                                    {param.description}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  {/* Request Body */}
                  {selectedEndpoint.requestBody && (
                    <div>
                      <h3 className="mb-3 text-lg font-semibold">Request Body</h3>
                      <div className="rounded-lg border bg-muted/50 p-4">
                        <p className="mb-2 text-sm text-muted-foreground">
                          Content-Type:{" "}
                          {selectedEndpoint.requestBody.contentType}
                        </p>
                        <pre className="overflow-x-auto text-sm">
                          {JSON.stringify(
                            selectedEndpoint.requestBody.example,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Responses */}
                  <div>
                    <h3 className="mb-3 text-lg font-semibold">Responses</h3>
                    <div className="space-y-2">
                      {Object.entries(selectedEndpoint.responses).map(
                        ([code, response]) => (
                          <div key={code} className="rounded-lg border p-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded px-2 py-0.5 text-sm font-medium ${
                                  code.startsWith("2")
                                    ? "bg-green-100 text-green-700"
                                    : code.startsWith("4")
                                      ? "bg-yellow-100 text-yellow-700"
                                      : "bg-red-100 text-red-700"
                                }`}
                              >
                                {code}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {response.description}
                              </span>
                            </div>
                            {response.example && (
                              <pre className="mt-2 overflow-x-auto text-sm">
                                {JSON.stringify(response.example, null, 2)}
                              </pre>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  {/* Code Examples / Try It */}
                  <div>
                    <div className="mb-4 flex gap-2">
                      <Button
                        variant={activeTab === "code" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActiveTab("code")}
                      >
                        <Code className="mr-2 h-4 w-4" />
                        Code
                      </Button>
                      <Button
                        variant={activeTab === "try" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActiveTab("try")}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Try It
                      </Button>
                    </div>

                    {activeTab === "code" && (
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          {["curl", "python", "javascript"].map((lang) => (
                            <Button
                              key={lang}
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                copyToClipboard(
                                  generateCodeSnippet(selectedEndpoint, lang),
                                  lang
                                )
                              }
                            >
                              {copied === lang ? (
                                <Check className="mr-2 h-4 w-4" />
                              ) : (
                                <Copy className="mr-2 h-4 w-4" />
                              )}
                              {lang.charAt(0).toUpperCase() + lang.slice(1)}
                            </Button>
                          ))}
                        </div>
                        <div className="rounded-lg bg-slate-950 p-4">
                          <pre className="overflow-x-auto text-sm text-slate-50">
                            {generateCodeSnippet(selectedEndpoint, "curl")}
                          </pre>
                        </div>
                      </div>
                    )}

                    {activeTab === "try" && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">API Key</label>
                          <Input
                            placeholder="Enter your API key"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                          />
                        </div>
                        <Button onClick={executeRequest} disabled={isLoading}>
                          {isLoading ? "Sending..." : "Send Request"}
                        </Button>
                        {tryResponse && (
                          <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-50">
                            {tryResponse}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <Layers className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold">
                      Select an endpoint
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Choose an endpoint from the list to view the documentation
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}