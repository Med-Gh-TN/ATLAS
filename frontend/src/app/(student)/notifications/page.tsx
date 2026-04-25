"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  FileText,
  GraduationCap,
  MessageSquare,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
} from "@/queries";

export default function NotificationsPage() {
  const router = useRouter();
  const { data: notifications, isLoading } = useNotificationsQuery();
  const markRead = useMarkNotificationReadMutation();
  const markAllRead = useMarkAllNotificationsReadMutation();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const filteredNotifications = notifications?.items?.filter((n) => {
    if (filter === "unread") return !n.is_read;
    return true;
  });

  const handleMarkAllRead = () => {
    const unreadIds =
      notifications?.items?.filter((n) => !n.is_read).map((n) => n.id) || [];
    if (unreadIds.length > 0) {
      markAllRead.mutate(unreadIds);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "contribution":
        return FileText;
      case "achievement":
        return GraduationCap;
      case "message":
        return MessageSquare;
      default:
        return Bell;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">
            {notifications?.items?.filter((n) => !n.is_read).length || 0} unread
            notifications
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={
              !notifications?.items?.some((n) => !n.is_read) || markAllRead.isPending
            }
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all read
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        <Button
          variant={filter === "unread" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("unread")}
        >
          Unread
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filteredNotifications?.length === 0 ? (
        <EmptyState
          type="notifications"
          title="No notifications"
          description={
            filter === "unread"
              ? "You're all caught up!"
              : "You have no notifications yet"
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredNotifications?.map((notification) => {
            const Icon = getIcon(notification.type);
            return (
              <Card
                key={notification.id}
                className={`transition-colors ${
                  !notification.is_read ? "border-l-4 border-l-primary" : ""
                }`}
              >
                <CardContent className="flex items-start gap-4 py-4">
                  <div
                    className={`rounded-lg p-2 ${
                      !notification.is_read ? "bg-primary/10" : "bg-muted"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${
                        !notification.is_read
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p
                          className={`font-medium ${!notification.is_read ? "" : "text-muted-foreground"}`}
                        >
                          {notification.title}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {notification.message}
                        </p>
                      </div>
                      {!notification.is_read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => markRead.mutate(notification.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(notification.created_at).toLocaleDateString(
                        "fr-TN",
                        {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
