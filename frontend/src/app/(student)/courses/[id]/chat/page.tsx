"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useCourseQuery } from "@/queries";
import { MessageCircle, Send, Bot, Loader2 } from "lucide-react";

export default function ChatPage() {
  const params = useParams();
  const courseId = params.id as string;
  const { data: course } = useCourseQuery(courseId);
  const [messages, setMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user" as const, content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `This is a demo response about "${course?.title}". In production, this would connect to the RAG API to answer questions about the course material.`,
        },
      ]);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">AI Chat</h1>
        <p className="text-muted-foreground">
          Ask questions about {course?.title || "this course"}
        </p>
      </div>

      <Card className="flex-1 flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-5 w-5" />
            RAG-Powered Assistant
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-[300px]">
            {messages.length === 0 ? (
              <EmptyState
                type="chat"
                title="Start a conversation"
                description="Ask questions about the course content and get AI-powered answers"
              />
            ) : (
              messages.map((message, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[80%] ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="rounded-lg bg-muted px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Ask a question about the course..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={isLoading}
            />
            <Button onClick={handleSend} disabled={!input.trim() || isLoading}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
