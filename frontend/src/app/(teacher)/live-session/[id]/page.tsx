"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  Users,
  Hand,
  MessageSquare,
  Settings,
  MoreVertical,
  PhoneOff,
  Maximize,
  Share2,
  HandMetal,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { WebSocketClient } from "@/lib/api";
import { PdfViewer } from "@/components/ui/pdf-viewer";
import type { LiveSessionParticipant } from "@/types/api.types";

interface Participant extends LiveSessionParticipant {
  isVideoOn: boolean;
  isAudioOn: boolean;
  hasRaisedHand: boolean;
}

const MOCK_PARTICIPANTS: Participant[] = [
  {
    id: "p1",
    session_id: "s1",
    user_id: "user-2",
    user_name: "Fatima Zahra",
    joined_at: "2024-01-20T18:00:00Z",
    is_presenter: false,
    isVideoOn: true,
    isAudioOn: true,
    hasRaisedHand: false,
  },
  {
    id: "p2",
    session_id: "s1",
    user_id: "user-3",
    user_name: "Youssef Trabelsi",
    joined_at: "2024-01-20T18:01:00Z",
    is_presenter: false,
    isVideoOn: true,
    isAudioOn: false,
    hasRaisedHand: true,
  },
  {
    id: "p3",
    session_id: "s1",
    user_id: "user-4",
    user_name: "Sarra Hamdi",
    joined_at: "2024-01-20T18:02:00Z",
    is_presenter: false,
    isVideoOn: false,
    isAudioOn: true,
    hasRaisedHand: false,
  },
];

interface ChatMessage {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  timestamp: string;
}

export default function LiveSessionDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const isHost = searchParams.get("mode") === "host";
  const sessionTitle = searchParams.get("title") || "Live Session";

  const [isVideoOn, setIsVideoOn] = useState(isHost);
  const [isAudioOn, setIsAudioOn] = useState(isHost);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [numPdfPages, setNumPdfPages] = useState(0);

  const [participants] = useState<Participant[]>(MOCK_PARTICIPANTS);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      user_id: "user-2",
      user_name: "Fatima Zahra",
      content: "Hello everyone!",
      timestamp: "18:05",
    },
    {
      id: "2",
      user_id: "user-3",
      user_name: "Youssef Trabelsi",
      content: "Ready for the session!",
      timestamp: "18:06",
    },
  ]);
  const [newMessage, setNewMessage] = useState("");
  const [activePanel, setActivePanel] = useState<
    "chat" | "participants" | null
  >(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const wsRef = useRef<WebSocketClient | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    wsRef.current = new WebSocketClient();
    wsRef.current.connect(`/ws/live-sessions/${sessionId}`);

    const unsubscribe = wsRef.current.subscribe(
      `session:${sessionId}`,
      (untypedData: unknown) => {
        const data = untypedData as { type: string; page: number; active: boolean };
        if (data.type === "PAGE_CHANGE") {
          setCurrentPdfPage(data.page);
        } else if (data.type === "TOGGLE_SCREEN_SHARE") {
          setIsScreenSharing(data.active);
          if (data.page && !isHost) {
            setCurrentPdfPage(data.page);
          }
        } else if (data.type === "SYNC_REQUEST" && isHost) {
          wsRef.current?.send({ type: "SYNC_STATE", active: isScreenSharing, page: currentPdfPage });
        } else if (data.type === "SYNC_STATE" && !isHost) {
          setIsScreenSharing(data.active);
          setCurrentPdfPage(data.page);
        }
      },
    );

    if (!isHost) {
      wsRef.current.send({ type: "SYNC_REQUEST" });
    }

    return () => {
      unsubscribe();
      wsRef.current?.disconnect();
    };
  }, [sessionId, isHost, isScreenSharing, currentPdfPage]);

  useEffect(() => {
    if (isVideoOn && localVideoRef.current && !localStreamRef.current) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: isAudioOn })
        .then((stream) => {
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        })
        .catch(console.error);
    } else if (!isVideoOn && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    }
  }, [isVideoOn, isAudioOn]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      user_id: "current-user",
      user_name: "You",
      content: newMessage.trim(),
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setChatMessages((prev) => [...prev, msg]);
    setNewMessage("");
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const setPage = (newPage: number) => {
    setCurrentPdfPage(newPage);
    if (isHost) {
      wsRef.current?.send({ type: "PAGE_CHANGE", page: newPage });
    }
  };

  const handleToggleScreenShare = () => {
    if (!isHost) return;
    const newState = !isScreenSharing;
    setIsScreenSharing(newState);
    wsRef.current?.send({ type: "TOGGLE_SCREEN_SHARE", active: newState, page: currentPdfPage });
  };

  const endSession = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    router.push("/live-session");
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-2 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={isHost ? "/live-session" : "/courses"}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Circle className="h-3 w-3 fill-red-500 text-red-500" />
            <span className="font-medium">{sessionTitle}</span>
          </div>
          <Badge variant="outline" className="font-mono">
            {formatTime(elapsedTime)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
          {isHost && (
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={endSession}>
            <PhoneOff className="h-4 w-4 mr-2" />
            End Session
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-4 overflow-auto">
          <div className="flex flex-col h-full gap-4">
            {isScreenSharing ? (
              <div className="flex-1 rounded-lg overflow-hidden bg-muted flex flex-col relative w-full h-full min-h-[400px]">
                <PdfViewer
                  url="https://arxiv.org/pdf/1706.03762.pdf"
                  pageNumber={currentPdfPage}
                  onLoadSuccess={setNumPdfPages}
                />
                <div className="absolute top-2 right-2 flex gap-2 z-10">
                  <Badge variant="secondary" className="shadow">
                    PDF Sync Active
                  </Badge>
                </div>
                {isHost && (
                   <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-background/90 p-2 rounded-full shadow-lg z-10 border">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage(Math.max(1, currentPdfPage - 1))}
                        disabled={currentPdfPage <= 1}
                      >
                         Prev
                      </Button>
                      <span className="text-sm font-medium">Page {currentPdfPage} of {numPdfPages || '-'}</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage(Math.min(numPdfPages, currentPdfPage + 1))}
                        disabled={numPdfPages > 0 && currentPdfPage >= numPdfPages}
                      >
                         Next
                      </Button>
                   </div>
                )}
                {!isHost && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 p-2 rounded-full shadow-lg z-10 border">
                    <span className="text-sm font-medium">Host is presenting: Page {currentPdfPage}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 h-full">
                {isHost && (
                  <div className="relative rounded-lg overflow-hidden bg-muted aspect-video">
                    {isVideoOn ? (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <VideoOff className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 flex items-center gap-2">
                       <Badge variant="secondary">You (Host)</Badge>
                       {!isAudioOn && <MicOff className="h-4 w-4 text-destructive" />}
                    </div>
                  </div>
                )}


            {participants.map((participant) => (
              <div
                key={participant.id}
                className="relative rounded-lg overflow-hidden bg-muted aspect-video"
              >
                {participant.isVideoOn ? (
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <Avatar className="h-16 w-16">
                      <AvatarFallback className="text-2xl">
                        {participant.user_name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Avatar className="h-16 w-16">
                      <AvatarFallback className="text-2xl">
                        {participant.user_name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {participant.user_name}
                  </Badge>
                  {!participant.isAudioOn && (
                    <MicOff className="h-4 w-4 text-destructive" />
                  )}
                  {participant.hasRaisedHand && (
                    <Hand className="h-4 w-4 text-yellow-500" />
                  )}
                </div>
              </div>
            ))}

                {participants.length < 6 && (
                  <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 flex items-center justify-center aspect-video">
                    <div className="text-center text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">Waiting for participants...</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {activePanel && (
          <div className="w-80 border-l bg-card flex flex-col">
            <div className="flex border-b">
              <button
                onClick={() => setActivePanel("chat")}
                className={cn(
                  "flex-1 px-4 py-2 text-sm font-medium transition-colors",
                  activePanel === "chat"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground",
                )}
              >
                <MessageSquare className="h-4 w-4 inline mr-1" />
                Chat
              </button>
              <button
                onClick={() => setActivePanel("participants")}
                className={cn(
                  "flex-1 px-4 py-2 text-sm font-medium transition-colors",
                  activePanel === "participants"
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground",
                )}
              >
                <Users className="h-4 w-4 inline mr-1" />
                {participants.length}
              </button>
              <button onClick={() => setActivePanel(null)} className="px-2">
                <span className="text-muted-foreground">&times;</span>
              </button>
            </div>

            {activePanel === "chat" && (
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {msg.user_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {msg.timestamp}
                        </span>
                      </div>
                      <p className="text-sm">{msg.content}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {activePanel === "chat" && (
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  />
                  <Button size="icon" onClick={sendMessage}>
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {activePanel === "participants" && (
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-2">
                  {participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {p.user_name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{p.user_name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {!p.isAudioOn && (
                          <MicOff className="h-3 w-3 text-muted-foreground" />
                        )}
                        {p.hasRaisedHand && (
                          <Hand className="h-3 w-3 text-yellow-500" />
                        )}
                        {isHost && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                          >
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 p-4 border-t bg-card">
        <Button
          variant={isAudioOn ? "secondary" : "destructive"}
          size="icon"
          onClick={() => setIsAudioOn(!isAudioOn)}
          className="h-12 w-12 rounded-full"
        >
          {isAudioOn ? (
            <Mic className="h-5 w-5" />
          ) : (
            <MicOff className="h-5 w-5" />
          )}
        </Button>
        <Button
          variant={isVideoOn ? "secondary" : "destructive"}
          size="icon"
          onClick={() => setIsVideoOn(!isVideoOn)}
          className="h-12 w-12 rounded-full"
        >
          {isVideoOn ? (
            <Video className="h-5 w-5" />
          ) : (
            <VideoOff className="h-5 w-5" />
          )}
        </Button>
        <Button
          variant={isScreenSharing ? "default" : "secondary"}
          size="icon"
          onClick={handleToggleScreenShare}
          disabled={!isHost}
          className="h-12 w-12 rounded-full"
        >
          <Monitor className="h-5 w-5" />
        </Button>
        {!isHost && (
          <Button
            variant="secondary"
            size="icon"
            className="h-12 w-12 rounded-full"
          >
            <HandMetal className="h-5 w-5" />
          </Button>
        )}
        <div className="w-px h-8 bg-border mx-2" />
        <Button
          variant={activePanel === "chat" ? "default" : "secondary"}
          size="icon"
          onClick={() => setActivePanel(activePanel === "chat" ? null : "chat")}
          className="h-12 w-12 rounded-full"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
        <Button
          variant={activePanel === "participants" ? "default" : "secondary"}
          size="icon"
          onClick={() =>
            setActivePanel(
              activePanel === "participants" ? null : "participants",
            )
          }
          className="h-12 w-12 rounded-full"
        >
          <Users className="h-5 w-5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={toggleFullscreen}
          className="h-12 w-12 rounded-full"
        >
          <Maximize className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
