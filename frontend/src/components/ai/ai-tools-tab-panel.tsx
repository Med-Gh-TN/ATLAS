"use client";

import { useState, useCallback } from "react";
import {
  MessageSquare,
  FileText,
  Layers,
  FileQuestion,
  GitBranch,
  Send,
  Loader2,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Download,
  Plus,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useCreateRagSessionMutation } from "@/queries";
import {
  useGenerateFlashcardsMutation,
  useGenerateQuizMutation,
  useGenerateSummaryMutation,
  useGenerateMindmapMutation
} from "@/queries/study";
import { ragApi } from "@/lib/api";
import type { RAGMessage, RAGStreamEvent, Course } from "@/types/api.types";

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
    placeholder: "Ask a question about the course...",
    emptyTitle: "Start a conversation",
    emptyDescription:
      "Ask questions about the course content and get AI-powered answers.",
  },
  summary: {
    label: "Summary",
    icon: FileText,
    placeholder: "Generate a summary of the course...",
    emptyTitle: "Generate a Summary",
    emptyDescription: "Get an AI-powered summary of the course content.",
  },
  flashcards: {
    label: "Flashcards",
    icon: Layers,
    placeholder: "Generate flashcards from the course...",
    emptyTitle: "Generate Flashcards",
    emptyDescription: "Create interactive flashcards from the course material.",
  },
  quiz: {
    label: "Quiz",
    icon: FileQuestion,
    placeholder: "Generate a quiz from the course...",
    emptyTitle: "Take a Quiz",
    emptyDescription: "Test your knowledge with AI-generated quizzes.",
  },
  mindmap: {
    label: "Mind Map",
    icon: GitBranch,
    placeholder: "Generate a mind map...",
    emptyTitle: "Generate Mind Map",
    emptyDescription:
      "Visualize the course structure as an interactive mind map.",
  },
};

interface ChatPanelProps {
  course: Course | null;
}

function ChatPanel({ course }: ChatPanelProps) {
  const [messages, setMessages] = useState<RAGMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamContent, setCurrentStreamContent] = useState("");
  const [currentSources, setCurrentSources] = useState<RAGMessage["sources"]>(
    [],
  );

  const createSession = useCreateRagSessionMutation(course?.id || "");

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !course || isStreaming) return;

    const userMessage: RAGMessage = {
      role: "user",
      content: inputMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsStreaming(true);
    setCurrentStreamContent("");
    setCurrentSources([]);

    try {
      let sessionId = "";

      if (!createSession.data?.session_id) {
        const session = await createSession.mutateAsync();
        sessionId = session.session_id;
      } else {
        sessionId = createSession.data.session_id;
      }

      let fullContent = "";
      const sources: RAGMessage["sources"] = [];

      const streamHandler = (event: RAGStreamEvent) => {
        if (event.type === "token" && event.content) {
          fullContent += event.content;
          setCurrentStreamContent(fullContent);
        }
        if (event.type === "sources" && event.sources) {
          sources.push(...event.sources);
          setCurrentSources([...sources]);
        }
      };

      ragApi.streamMessage(sessionId, inputMessage, streamHandler);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: fullContent,
          sources,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsStreaming(false);
      setCurrentStreamContent("");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 && !isStreaming ? (
          <EmptyState type="chat" className="h-full" />
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" && "flex-row-reverse",
                )}
              >
                <div
                  className={cn(
                    "rounded-lg px-4 py-2 max-w-[80%]",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-primary/20">
                      <p className="text-xs opacity-70 mb-1">Sources:</p>
                      {msg.sources.slice(0, 3).map((src, j) => (
                        <div
                          key={j}
                          className="text-xs opacity-70 flex items-center gap-1"
                        >
                          <span className="font-medium">{src.page}</span>
                          <span className="truncate">
                            {src.text?.slice(0, 50)}...
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isStreaming && currentStreamContent && (
              <div className="flex gap-3">
                <div className="rounded-lg px-4 py-2 bg-muted max-w-[80%]">
                  <p className="text-sm whitespace-pre-wrap">
                    {currentStreamContent}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {isStreaming && (
        <div className="px-4 py-2 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>ATLAS is thinking...</span>
          </div>
        </div>
      )}

      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            placeholder="Ask about the course..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
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
  tool: AIToolType;
  course: Course | null;
  className?: string;
}

function ToolPanel({ tool, course, className }: ToolPanelProps) {
  const config = toolConfig[tool];
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const generateFlashcards = useGenerateFlashcardsMutation();
  const generateQuiz = useGenerateQuizMutation();
  const generateSummary = useGenerateSummaryMutation();
  const generateMindmap = useGenerateMindmapMutation();

  const handleGenerate = async () => {
    if (!course) return;
    setIsGenerating(true);
    try {
      if (tool === "flashcards") {
        await generateFlashcards.mutateAsync({ courseId: course.id });
      } else if (tool === "quiz") {
        await generateQuiz.mutateAsync({ courseId: course.id });
      } else if (tool === "summary") {
        await generateSummary.mutateAsync({ courseId: course.id });
      } else if (tool === "mindmap") {
        await generateMindmap.mutateAsync({ courseId: course.id });
      }
      setGeneratedContent(
        `Generation started successfully. You can view your generated ${config.label.toLowerCase()} in the dashboard soon.`
      );
    } catch (error) {
       console.error(error);
       setGeneratedContent(`Failed to generate ${config.label.toLowerCase()}.`);
    } finally {
       setIsGenerating(false);
    }
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <ScrollArea className="flex-1 p-4">
        {generatedContent ? (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <config.icon className="h-5 w-5 text-primary" />
                    <span className="font-medium">{config.label}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleGenerate}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="prose prose-sm max-w-none">
                  <p>{generatedContent}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 rounded-full bg-primary/10 mb-4">
              <config.icon className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{config.emptyTitle}</h3>
            <p className="text-muted-foreground mb-6 max-w-sm">
              {config.emptyDescription}
            </p>
            <Button onClick={handleGenerate} disabled={!course || isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate {config.label}
                </>
              )}
            </Button>
            {!course && (
              <p className="text-sm text-muted-foreground mt-2">
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
      <div className={cn("flex flex-col h-full bg-background", className)}>
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
                  : "hover:bg-muted",
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
