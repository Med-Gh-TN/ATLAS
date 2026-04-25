"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Video,
  Calendar,
  Clock,
  Users,
  Plus,
  Play,
  Settings,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface ScheduledSession {
  id: string;
  title: string;
  course_id?: string;
  course_name?: string;
  scheduled_at: string;
  participant_count: number;
  max_participants: number;
}

const MOCK_COURSES = [
  { id: "c1", title: "Introduction to Algorithms" },
  { id: "c2", title: "Data Structures" },
  { id: "c3", title: "Linear Algebra" },
  { id: "c4", title: "Physics 101" },
];

const MOCK_SCHEDULED: ScheduledSession[] = [
  {
    id: "s1",
    title: "Weekly Q&A Session",
    course_id: "c1",
    course_name: "Introduction to Algorithms",
    scheduled_at: "2024-01-25T18:00:00Z",
    participant_count: 0,
    max_participants: 50,
  },
  {
    id: "s2",
    title: "Midterm Review",
    course_id: "c2",
    course_name: "Data Structures",
    scheduled_at: "2024-01-27T14:00:00Z",
    participant_count: 12,
    max_participants: 30,
  },
];

export default function LiveSessionHostPage() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("50");

  const handleCreateSession = () => {
    if (!title || !courseId || !scheduledDate || !scheduledTime) return;
    const sessionId = `session-${Date.now()}`;
    router.push(
      `/live-session/${sessionId}?mode=host&title=${encodeURIComponent(title)}`,
    );
  };

  const startImmediateSession = () => {
    const sessionId = `session-${Date.now()}`;
    router.push(`/live-session/${sessionId}?mode=host&title=Live+Session`);
  };

  return (
    <div className="container py-8 mx-auto max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Live Sessions</h1>
          <p className="text-muted-foreground">
            Host interactive learning sessions with your students
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreate(true)}>
            <Calendar className="h-4 w-4 mr-2" />
            Schedule Session
          </Button>
          <Button onClick={startImmediateSession}>
            <Video className="h-4 w-4 mr-2" />
            Go Live Now
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Schedule a New Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Session Title
              </label>
              <Input
                placeholder="e.g., Weekly Q&A Session"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Description (optional)
              </label>
              <Textarea
                placeholder="What will this session cover?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Course</label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent>
                  {MOCK_COURSES.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Date</label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Time</label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Max Participants
              </label>
              <Select
                value={maxParticipants}
                onValueChange={setMaxParticipants}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateSession}
                disabled={
                  !title || !courseId || !scheduledDate || !scheduledTime
                }
              >
                Schedule Session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-green-500" />
              Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No active sessions</p>
              <p className="text-sm text-muted-foreground mt-1">
                Start a new session to begin teaching live
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              Scheduled Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {MOCK_SCHEDULED.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No scheduled sessions</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Schedule Your First Session
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {MOCK_SCHEDULED.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <Video className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">{session.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {session.course_name}
                        </p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(
                              session.scheduled_at,
                            ).toLocaleDateString()}{" "}
                            at{" "}
                            {new Date(session.scheduled_at).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {session.participant_count}/
                            {session.max_participants}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {new Date(session.scheduled_at) > new Date()
                          ? "Scheduled"
                          : "Ready"}
                      </Badge>
                      <Button size="sm" asChild>
                        <Link href={`/live-session/${session.id}?mode=host`}>
                          <Play className="h-4 w-4 mr-2" />
                          Start
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No past sessions yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your completed sessions will appear here
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
