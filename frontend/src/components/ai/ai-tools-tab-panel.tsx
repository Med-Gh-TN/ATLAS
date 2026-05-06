/**
 * @file frontend/src/components/ai/ai-tools-tab-panel.tsx
 * @description AI Tools UI.
 * SOTA FIX: Auto-generate asset on mount when no cached version exists.
 * SOTA FIX: Use dedicated APIs for all asset types (summary, mindmap, quiz) to match flashcard pattern.
 * @layer Core Logic
 */

"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import dagre from "dagre";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
} from "@xyflow/react";

import {
  BadgeCheck,
  Copy,
  Download,
  FileQuestion,
  FileText,
  GitBranch,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import { useCreateRagSessionMutation } from "@/queries";
import {
  useGenerateFlashcardsMutation,
  useGenerateQuizMutation,
} from "@/queries/study";
import {
  coursesApi,
  flashcardsApi,
  quizApi,
  summariesApi,
  mindmapsApi,
  ragApi,
} from "@/lib/api";
import type {
  Course,
  FlashcardDeckDetail,
  Mindmap,
  QuizDetail,
  RAGMessage,
  RAGStreamEvent,
  Summary,
} from "@/types/api.types";

import { useMutation, useQuery } from "@tanstack/react-query";

export type AIToolType = "chat" | "summary" | "flashcards" | "quiz" | "mindmap";

interface AIToolsTabPanelProps {
  tool: AIToolType;
  course: Course | null;
  className?: string;
}

const toolConfig = {
  chat: {
    label: "Chat",
    icon: MessageSquare,
    emptyTitle: "Start a conversation",
    emptyDescription:
      "Ask questions about the course content and get AI-powered answers.",
  },
  summary: {
    label: "Summary",
    icon: FileText,
    emptyTitle: "Generate a Summary",
    emptyDescription: "Get an AI-powered summary of the course content.",
  },
  flashcards: {
    label: "Flashcards",
    icon: Layers,
    emptyTitle: "Generate Flashcards",
    emptyDescription: "Create interactive flashcards from the course material.",
  },
  quiz: {
    label: "Quiz",
    icon: FileQuestion,
    emptyTitle: "Take a Quiz",
    emptyDescription: "Test your knowledge with AI-generated quizzes.",
  },
  mindmap: {
    label: "Mind Map",
    icon: GitBranch,
    emptyTitle: "Generate Mind Map",
    emptyDescription:
      "Visualize the course structure as an interactive mind map.",
  },
} as const;

const assetTypeMap: Partial<
  Record<Exclude<AIToolType, "chat">, "SUMMARY" | "MINDMAP" | "FLASHCARDS" | "QUIZ">
> = {
  summary: "SUMMARY",
  mindmap: "MINDMAP",
  flashcards: "FLASHCARDS",
  quiz: "QUIZ",
};

interface ChatPanelProps {
  course: Course | null;
}

type ToolResult =
  | { kind: "summary"; data: Summary }
  | { kind: "flashcards"; data: FlashcardDeckDetail }
  | { kind: "quiz"; data: QuizDetail }
  | { kind: "mindmap"; data: Mindmap };

const nodeWidth = 280;
const nodeHeight = 80;

const getLayoutedElements = (nodes: any[], edges: any[], direction = "TB") => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 120 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: "top",
      sourcePosition: "bottom",
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
      style: {
        ...node.style,
        background: "hsl(var(--card))",
        color: "hsl(var(--card-foreground))",
        borderColor: "hsl(var(--border))",
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "0.5rem",
        padding: "16px",
        fontWeight: "500",
        fontSize: "14px",
        boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        width: nodeWidth,
        textAlign: "center",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      },
    };
  });

  const newEdges = edges.map((edge) => ({
    ...edge,
    type: "smoothstep",
    animated: true,
    style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
  }));

  return { nodes: newNodes, edges: newEdges };
};

export function MindMapVisualizer({
  initialNodes,
  initialEdges,
}: {
  initialNodes: any[];
  initialEdges: any[];
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(initialNodes || [], initialEdges || []),
    [initialNodes, initialEdges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = getLayoutedElements(
      initialNodes || [],
      initialEdges || []
    );
    setNodes(newNodes);
    setEdges(newEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  if (!mounted) {
    return (
      <div className="flex h-[600px] w-full items-center justify-center rounded-xl border bg-muted/10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const flowTheme = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <div className="relative h-[600px] w-full overflow-hidden rounded-xl border bg-muted/10">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.4 }}
        minZoom={0.1}
        colorMode={flowTheme}
      >
        <Background color="hsl(var(--muted-foreground))" gap={16} />
        <Controls className="border fill-foreground bg-background" />
        <MiniMap
          nodeColor="hsl(var(--primary))"
          maskColor="hsl(var(--background))"
          className="rounded-md border bg-background"
        />
        <Panel position="top-right">
          <BadgeCheck className="h-5 w-5 text-emerald-500 opacity-50" />
        </Panel>
      </ReactFlow>
    </div>
  );
}

function getMindmapNodeLabel(node: Record<string, unknown>): string {
  if (node.data && typeof (node.data as any).label === "string")
    return (node.data as any).label;
  const keys = ["label", "title", "text", "name", "id"];
  for (const key of keys) {
    const value = node[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "Untitled node";
}

function getCourseDocumentVersionId(course: Course | null): string | null {
  if (!course) return null;
  return course.current_version_id || course.current_version?.id || null;
}

function normalizeSummaryContent(
  summary: Summary["content"]
): { text: string; title?: string } {
  if (typeof summary === "string") {
    return { text: summary };
  }

  const overview =
    typeof summary.overview === "string" ? summary.overview : "";
  const keyConcepts = Array.isArray(summary.key_concepts)
    ? summary.key_concepts
        .filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0
        )
        .map((item) => `- ${item}`)
        .join("\n")
    : "";
  const conclusion =
    typeof summary.conclusion === "string" && summary.conclusion.trim()
      ? `\n\nConclusion\n${summary.conclusion}`
      : "";

  const sections = [overview];
  if (keyConcepts) {
    sections.push(`Key concepts\n${keyConcepts}`);
  }
  if (conclusion) {
    sections.push(conclusion.trim());
  }
  return { text: sections.filter(Boolean).join("\n\n") };
}

/** Safely normalise quiz options into a string array for copy/download. */
function safeOptionsArray(options: unknown): string[] {
  if (Array.isArray(options)) {
    return options.map((o, i) =>
      typeof o === "string"
        ? o
        : (o as any)?.key
          ? `${(o as any).key}: ${(o as any).value}`
          : `Option ${i + 1}`
    );
  }
  if (typeof options === "string") {
    try {
      const parsed = JSON.parse(options);
      if (Array.isArray(parsed)) return safeOptionsArray(parsed);
    } catch {}
    return [options];
  }
  return [];
}

function buildCopyContent(result: ToolResult): string {
  switch (result.kind) {
    case "summary":
      return normalizeSummaryContent(result.data.content).text;
    case "flashcards":
      return result.data.cards
        .map(
          (card, index) =>
            `${index + 1}. ${card.question}\nAnswer: ${card.answer}`
        )
        .join("\n\n");
    case "quiz":
      return result.data.questions
        .map((question, index) => {
          const options = safeOptionsArray(question.options)
            .map((opt, oi) => `${oi + 1}. ${opt}`)
            .join("\n");
          return `${index + 1}. ${question.question}\n${options}`;
        })
        .join("\n\n");
    case "mindmap":
      return [
        result.data.title,
        `Nodes: ${result.data.nodes.length}`,
        `Edges: ${result.data.edges.length}`,
        "",
        ...result.data.nodes
          .slice(0, 10)
          .map((node) => `- ${getMindmapNodeLabel(node)}`),
      ].join("\n");
  }
}

function buildDownloadPayload(result: ToolResult): {
  content: string;
  fileName: string;
  mimeType: string;
} {
  switch (result.kind) {
    case "summary":
      return {
        content: normalizeSummaryContent(result.data.content).text,
        fileName: `summary-${result.data.id}.txt`,
        mimeType: "text/plain;charset=utf-8",
      };
    case "flashcards":
      return {
        content: JSON.stringify(result.data, null, 2),
        fileName: `flashcards-${result.data.id}.json`,
        mimeType: "application/json;charset=utf-8",
      };
    case "quiz":
      return {
        content: JSON.stringify(result.data, null, 2),
        fileName: `quiz-${result.data.id}.json`,
        mimeType: "application/json;charset=utf-8",
      };
    case "mindmap":
      return {
        content: JSON.stringify(result.data, null, 2),
        fileName: `mindmap-${result.data.id}.json`,
        mimeType: "application/json;charset=utf-8",
      };
  }
}

function ResultContent({ result }: { result: ToolResult }) {
  if (result.kind === "summary") {
    const normalized = normalizeSummaryContent(result.data.content);
    return (
      <div className="prose prose-sm max-w-none whitespace-pre-wrap">
        {normalized.text}
      </div>
    );
  }

  if (result.kind === "flashcards") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">Deck</p>
          <h3 className="text-lg font-semibold">{result.data.title}</h3>
          <p className="text-sm text-muted-foreground">
            {result.data.card_count} cards ready for review
          </p>
        </div>
        <div className="space-y-3">
          {result.data.cards.slice(0, 5).map((card, index) => (
            <div key={card.id} className="rounded-lg border p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Card {index + 1}
              </p>
              <p className="mt-2 font-medium">{card.question}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {card.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (result.kind === "quiz") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">Quiz Ready</p>
          <h3 className="text-lg font-semibold">
            {result.data.total_questions} questions
          </h3>
          <p className="text-sm text-muted-foreground">
            Time limit: {result.data.time_limit_minutes} minutes
          </p>
        </div>
        <div className="space-y-3">
          {result.data.questions.slice(0, 5).map((question, index) => (
            <div key={question.id} className="rounded-lg border p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Question {index + 1}
              </p>
              <p className="mt-2 font-medium">{question.question}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {Array.isArray(question.options)
                  ? question.options.map((option: any, optionIndex: number) => (
                      <div
                        key={`${question.id}-${optionIndex}`}
                        className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
                      >
                        {typeof option === "string"
                          ? option
                          : option?.key
                            ? `${option.key}: ${option.value}`
                            : JSON.stringify(option)}
                      </div>
                    ))
                  : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 flex h-full w-full flex-col">
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Interactive Knowledge Graph
          </p>
          <h3 className="text-lg font-semibold">{result.data.title}</h3>
          <p className="text-sm text-muted-foreground">
            {result.data.nodes.length} concepts and {result.data.edges.length}{" "}
            relationships
          </p>
        </div>
      </div>

      {result.data.nodes.length > 0 ? (
        <MindMapVisualizer
          initialNodes={result.data.nodes}
          initialEdges={result.data.edges}
        />
      ) : (
        <EmptyState
          title="Graph Visualization Error"
          description="The AI failed to generate structural coordinates for this concept."
        />
      )}
    </div>
  );
}

function ChatPanel({ course }: ChatPanelProps) {
  const [messages, setMessages] = useState<RAGMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamContent, setCurrentStreamContent] = useState("");
  const [currentSources, setCurrentSources] = useState<RAGMessage["sources"]>(
    []
  );

  const searchParams = useSearchParams();
  const createSession = useCreateRagSessionMutation(course?.id || "");
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, currentStreamContent]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !course || isStreaming) return;

    const userMessage: RAGMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: inputMessage,
      created_at: new Date().toISOString(),
      sources: [],
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsStreaming(true);
    setCurrentStreamContent("");
    setCurrentSources([]);

    try {
      let sessionId = "";

      if (!createSession.data?.id) {
        const versionsParam = searchParams.get("versions");
        const versionIds = versionsParam ? versionsParam.split(",") : [];

        const session = await (createSession.mutateAsync as any)(
          versionIds.length > 0
            ? { document_version_ids: versionIds }
            : undefined
        );
        sessionId = session.id;
      } else {
        sessionId = createSession.data.id;
      }

      let fullContent = "";
      const sources: RAGMessage["sources"] = [];

      await new Promise<void>((resolve, reject) => {
        const streamHandler = (event: RAGStreamEvent) => {
          if (event.type === "token" && event.content) {
            fullContent += event.content;
            flushSync(() => {
              setCurrentStreamContent(fullContent);
            });
          }

          if (event.type === "sources" && event.sources) {
            sources.splice(0, sources.length, ...event.sources);
            setCurrentSources([...sources]);
          }

          if (event.type === "done") {
            resolve();
          }

          if (event.type === "error") {
            reject(new Error(event.error || "Streaming failed"));
          }
        };

        ragApi.streamMessage(sessionId, inputMessage, streamHandler);
      });

      if (fullContent.trim()) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: fullContent,
            sources,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsStreaming(false);
      setCurrentStreamContent("");
      setCurrentSources([]);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollViewportRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && !isStreaming ? (
          <EmptyState type="chat" className="h-full" />
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" && "flex-row-reverse"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-4 py-2",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.sources.length > 0 && (
                    <div className="mt-2 border-t border-border pt-2">
                      <p className="mb-1 text-xs opacity-70">Sources:</p>
                      {msg.sources.slice(0, 3).map((src, index) => (
                        <div
                          key={`${msg.id}-${src.course_id}-${src.page}-${index}`}
                          className="flex items-center gap-1 text-xs opacity-70"
                        >
                          <span className="font-medium">{src.page}</span>
                          <span className="truncate">{src.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isStreaming && currentStreamContent && (
              <div className="flex gap-3">
                <div className="max-w-[80%] rounded-lg bg-muted px-4 py-2">
                  <p className="text-sm whitespace-pre-wrap">
                    {currentStreamContent}
                  </p>
                  {currentSources.length > 0 && (
                    <div className="mt-2 border-t border-border pt-2">
                      <p className="mb-1 text-xs opacity-70">Sources:</p>
                      {currentSources.slice(0, 3).map((src, index) => (
                        <div
                          key={`${src.course_id}-${src.page}-${index}`}
                          className="flex items-center gap-1 text-xs opacity-70"
                        >
                          <span className="font-medium">{src.page}</span>
                          <span className="truncate">{src.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {isStreaming && (
        <div className="border-t px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>ATLAS is thinking...</span>
          </div>
        </div>
      )}

      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            placeholder="Ask about the course..."
            value={inputMessage}
            onChange={(event) => setInputMessage(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleSendMessage()}
            disabled={!course || isStreaming}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!course || isStreaming || !inputMessage.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ToolPanelProps {
  tool: Exclude<AIToolType, "chat">;
  course: Course | null;
  className?: string;
}

function ToolPanel({ tool, course, className }: ToolPanelProps) {
  const config = toolConfig[tool];
  const documentVersionId = getCourseDocumentVersionId(course);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHydratingCached, setIsHydratingCached] = useState(false);

  const searchParams = useSearchParams();

  const generateFlashcards = useGenerateFlashcardsMutation();
  const generateQuiz = useGenerateQuizMutation();

  // Existence check (same as before, handles errors gracefully)
  const { data: myAssets, isLoading: isAssetMetaLoading } = useQuery({
    queryKey: ["my-assets", course?.id, documentVersionId],
    queryFn: async () => {
      try {
        return await coursesApi.getMyAssets(course!.id, documentVersionId!);
      } catch {
        return {
          flashcards: { exists: false, id: null },
          quiz: { exists: false, id: null },
          summary: { exists: false, id: null },
          mindmap: { exists: false, id: null },
        };
      }
    },
    enabled: !!course?.id && !!documentVersionId,
    retry: false,
  });

  // Hydrate cached result when assets already exist
  useEffect(() => {
    if (!documentVersionId || !myAssets || result || isHydratingCached) return;
    let assetId: string | null = null;
    let fetchFn: (() => Promise<ToolResult>) | null = null;

    if (
      tool === "flashcards" &&
      myAssets.flashcards.exists &&
      myAssets.flashcards.id
    ) {
      assetId = myAssets.flashcards.id;
      fetchFn = async () => {
        const deck = await flashcardsApi.getDeck(assetId!);
        return { kind: "flashcards" as const, data: deck };
      };
    } else if (tool === "quiz" && myAssets.quiz.exists && myAssets.quiz.id) {
      assetId = myAssets.quiz.id;
      fetchFn = async () => {
        const quiz = await quizApi.getQuiz(assetId!);
        return { kind: "quiz" as const, data: quiz };
      };
    } else if (
      tool === "summary" &&
      myAssets.summary.exists &&
      myAssets.summary.id
    ) {
      assetId = myAssets.summary.id;
      fetchFn = async () => {
        const summary = await summariesApi.get(assetId!);
        return { kind: "summary" as const, data: summary };
      };
    } else if (
      tool === "mindmap" &&
      myAssets.mindmap.exists &&
      myAssets.mindmap.id
    ) {
      assetId = myAssets.mindmap.id;
      fetchFn = async () => {
        const mindmap = await mindmapsApi.get(assetId!);
        return { kind: "mindmap" as const, data: mindmap };
      };
    }

    if (!assetId || !fetchFn) return;

    let cancelled = false;
    setIsHydratingCached(true);
    setErrorMessage(null);

    const run = async () => {
      try {
        const loaded = await fetchFn!();
        if (!cancelled) setResult(loaded);
      } catch (error) {
        if (!cancelled) console.error(error);
      } finally {
        if (!cancelled) setIsHydratingCached(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [documentVersionId, myAssets, isHydratingCached, result, tool]);

  // AUTO-GENERATION: If asset does not exist, generate immediately
  useEffect(() => {
    if (!documentVersionId || !myAssets || result) return;
    if (isGenerating || isHydratingCached) return;

    let shouldAutoGenerate = false;
    if (tool === "flashcards" && !myAssets.flashcards.exists)
      shouldAutoGenerate = true;
    else if (tool === "quiz" && !myAssets.quiz.exists)
      shouldAutoGenerate = true;
    else if (tool === "summary" && !myAssets.summary.exists)
      shouldAutoGenerate = true;
    else if (tool === "mindmap" && !myAssets.mindmap.exists)
      shouldAutoGenerate = true;

    if (!shouldAutoGenerate) return;

    handleGenerate();
  }, [documentVersionId, myAssets, result, isGenerating, isHydratingCached, tool]);

  const handleGenerate = async () => {
    if (!course) return;

    setIsGenerating(true);
    setErrorMessage(null);

    const versionsParam = searchParams.get("versions");
    const documentVersionIds = versionsParam ? versionsParam.split(",") : [];

    try {
      if (tool === "flashcards") {
        const generation = await generateFlashcards.mutateAsync({
          courseId: course.id,
          ...(documentVersionIds.length > 0 && {
            document_version_ids: documentVersionIds,
          }),
        });
        const deck = await flashcardsApi.getDeck(generation.job_id);
        setResult({ kind: "flashcards", data: deck });
      } else if (tool === "quiz") {
        const generation = await generateQuiz.mutateAsync({
          courseId: course.id,
          ...(documentVersionIds.length > 0 && {
            document_version_ids: documentVersionIds,
          }),
        });
        const quiz = await quizApi.getQuiz(generation.job_id);
        setResult({ kind: "quiz", data: quiz });
      } else if (tool === "summary") {
        if (!documentVersionId)
          throw new Error("No document version available.");
        const generation = await summariesApi.generate(course.id, "EXECUTIVE", "fr");
        const summary = await summariesApi.get(generation.job_id);
        setResult({ kind: "summary", data: summary });
      } else {
        // mindmap
        if (!documentVersionId)
          throw new Error("No document version available.");
        const generation = await mindmapsApi.generate(course.id, "fr");
        const mindmap = await mindmapsApi.get(generation.job_id);
        setResult({ kind: "mindmap", data: mindmap });
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(
        `Failed to generate ${config.label.toLowerCase()}. Please try again.`
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!result || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(buildCopyContent(result));
    } catch (error) {
      console.error("Failed to copy generated content:", error);
    }
  };

  const handleDownload = () => {
    if (!result || typeof window === "undefined") return;
    const payload = buildDownloadPayload(result);
    const blob = new Blob([payload.content], { type: payload.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = payload.fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <ScrollArea className="flex-1 p-4">
        {result ? (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <config.icon className="h-5 w-5 text-primary" />
                    <span className="font-medium">{config.label}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Cached
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={handleCopy}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleDownload}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                    >
                      <RefreshCw
                        className={cn(
                          "h-4 w-4",
                          isGenerating && "animate-spin"
                        )}
                      />
                    </Button>
                  </div>
                </div>
                <ResultContent result={result} />
              </CardContent>
            </Card>
          </div>
        ) : isGenerating || isHydratingCached ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 rounded-full bg-primary/10 p-4">
              <config.icon className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">{config.emptyTitle}</h3>
            <p className="mb-6 max-w-sm text-muted-foreground">
              {config.emptyDescription}
            </p>
            <Button
              onClick={handleGenerate}
              disabled={!course || isGenerating}
            >
              {isGenerating || isHydratingCached ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isHydratingCached ? "Loading..." : "Generating..."}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate {config.label}
                </>
              )}
            </Button>
            {errorMessage && (
              <p className="mt-3 text-sm text-destructive">{errorMessage}</p>
            )}
            {!course && (
              <p className="mt-2 text-sm text-muted-foreground">
                Select a course to use this feature
              </p>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function AIToolsTabPanel({
  tool,
  course,
  className,
}: AIToolsTabPanelProps) {
  if (tool === "chat") {
    return (
      <div className={cn("flex h-full flex-col bg-background", className)}>
        <ChatPanel course={course} />
      </div>
    );
  }

  return <ToolPanel tool={tool} course={course} className={className} />;
}

interface AIToolsSidebarProps {
  activeTab: AIToolType;
  onTabChange: (tab: AIToolType) => void;
  className?: string;
}

const tabs = [
  { id: "chat" as const, label: "Chat", icon: MessageSquare },
  { id: "summary" as const, label: "Summary", icon: FileText },
  { id: "flashcards" as const, label: "Flashcards", icon: Layers },
  { id: "quiz" as const, label: "Quiz", icon: FileQuestion },
  { id: "mindmap" as const, label: "Mind Map", icon: GitBranch },
];

export function AIToolsSidebar({
  activeTab,
  onTabChange,
  className,
}: AIToolsSidebarProps) {
  return (
    <div className={cn("p-4", className)}>
      <div className="space-y-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}