"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Clock,
  ArrowLeft,
  Send,
  Pin,
  FileText,
  Settings,
  Crown,
  Copy,
  Check,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore } from "@/store/auth.store";
import { WebSocketClient } from "@/lib/api";
import { useStudyGroupQuery, useUpdateStudyGroupNotesMutation } from "@/queries/study-groups";
import { TiptapEditor } from "@/components/ui/tiptap-editor";
import type { StudyGroupMember, GroupChatMessage } from "@/types/api.types";

export default function StudyGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id || "";

  const { data: group, isLoading } = useStudyGroupQuery(groupId);
  const updateNotesMutation = useUpdateStudyGroupNotesMutation();

  const [activeTab, setActiveTab] = useState<"chat" | "notes" | "members">("chat");
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [notesStr, setNotesStr] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocketClient | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    if (group?.notes && !notesStr) {
      setNotesStr(group.notes);
    }
  }, [group?.notes]);

  const handleNotesChange = (val: string) => {
    setNotesStr(val);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      updateNotesMutation.mutate({ id: groupId, notes: val });
    }, 1000);
  };


  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    wsRef.current = new WebSocketClient();
    wsRef.current.connect(`/ws/study-groups/${groupId}`);

    const unsubscribe = wsRef.current.subscribe(`chat:${groupId}`, (data) => {
      const msg = data as GroupChatMessage;
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      unsubscribe();
      wsRef.current?.disconnect();
    };
  }, [groupId]);

  const sendMessage = () => {
    if (!newMessage.trim() || !user) return;

    const message: GroupChatMessage = {
      id: `msg-${Date.now()}`,
      group_id: groupId,
      user_id: user.id,
      user_name: user.full_name || user.email,
      content: newMessage.trim(),
      created_at: new Date().toISOString(),
    };

    wsRef.current?.send({
      type: "message",
      channel: `chat:${groupId}`,
      data: message,
    });
    setMessages((prev) => [...prev, message]);
    setNewMessage("");
  };

  const copyInviteCode = () => {
    const code = `ATLAS-${groupId.slice(0, 8).toUpperCase()}`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading || !group) {
    return <div className="p-8 text-center text-muted-foreground">Loading group...</div>;
  }

  // Fallback defaults since backend spec usually leaves members out or maps to "members"
  const members = group.members || [
    { user_id: user?.id || "u1", name: user?.full_name || "You", role: "member", is_online: true }
  ];
  const isOwner = false; // Add owner real logic matching spec if backend provides an owner ID


  return (
    <div className="container py-6 mx-auto max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/study-groups">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{group.name}</h1>
            <Badge variant={group.is_public ? "default" : "secondary"}>
              {group.is_public ? "Public" : "Private"}
            </Badge>
          </div>
          <p className="text-muted-foreground">{group.module}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyInviteCode}>
            {copied ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {copied ? "Copied!" : "Copy Invite Code"}
          </Button>
          {isOwner && (
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="h-[600px] flex flex-col">
            <div className="flex border-b">
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === "chat"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setActiveTab("notes")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === "notes"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Shared Notes
              </button>
              <button
                onClick={() => setActiveTab("members")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === "members"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Members ({members.length})
              </button>
            </div>

            <CardContent className="flex-1 p-0">
              {activeTab === "chat" && (
                <div className="flex flex-col h-full">
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {messages.map((msg) => (
                        <div key={msg.id} className="flex gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {msg.user_name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {msg.user_name}
                                {(group as any).owner_id && msg.user_id === (group as any).owner_id && (
                                  <Crown className="inline-block h-3 w-3 ml-1 text-yellow-500" />
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(msg.created_at).toLocaleTimeString(
                                  [],
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </span>
                            </div>
                            <p className="text-sm mt-0.5">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                  <div className="p-4 border-t">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type a message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                      />
                      <Button
                        onClick={sendMessage}
                        disabled={!newMessage.trim()}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "notes" && (
                <div className="flex flex-col h-full bg-background p-4">
                   <div className="mb-2 flex items-center justify-between">
                     <h2 className="text-sm font-semibold">Shared Document</h2>
                     <span className="text-xs text-muted-foreground">Changes are saved automatically</span>
                   </div>
                   <TiptapEditor content={notesStr} onChange={handleNotesChange} />
                </div>
              )}

              {activeTab === "members" && (
                <ScrollArea className="h-full p-4">
                  <div className="space-y-2">
                    {members.map((member, i) => (
                      <div
                        key={member.user_id + i}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {member.name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {member.name}
                              </span>
                              {member.role === "owner" && (
                                <Crown className="h-4 w-4 text-yellow-500" />
                              )}
                            </div>
                            <p className="text-xs flex items-center gap-1">
                               <span className={`h-2 w-2 rounded-full ${member.is_online ? "bg-green-500" : "bg-muted-foreground"}`} />
                               {member.is_online ? "Online" : "Offline"}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            member.role === "owner" ? "default" : "secondary"
                          }
                        >
                          {member.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5" />
                Group Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Members</span>
                <span className="font-medium">
                  {group.member_count}/{group.max_members}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Active</span>
                <span className="font-medium">{group.last_active}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">
                  {group.last_active ? "Recently" : "Unknown"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming Session</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Video className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Weekly Study Session</p>
                  <p className="text-xs text-muted-foreground">
                    Tomorrow at 18:00
                  </p>
                </div>
              </div>
              <Button variant="outline" className="w-full mt-3">
                <Video className="h-4 w-4 mr-2" />
                Start Live Session
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                asChild
              >
                <Link href={`/dashboard`}>
                  <FileText className="h-4 w-4 mr-2" />
                  View Dashboard
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Video className="h-4 w-4 mr-2" />
                Schedule Session
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
