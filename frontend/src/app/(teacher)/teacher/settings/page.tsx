"use client";

import { useState } from "react";
import { Settings, Bell, Moon, Globe, Shield, Save } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/store/auth.store";

export default function TeacherSettings() {
  const { user } = useAuthStore();
  const [isSaving, setIsSaving] = useState(false);

  const [notifications, setNotifications] = useState({
    emailContributions: true,
    emailReviews: true,
    pushContributions: false,
    pushReviews: true,
  });

  const [preferences, setPreferences] = useState({
    darkMode: false,
    language: "en",
    autoApprove: false,
  });

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Profile Settings
          </CardTitle>
          <CardDescription>Update your profile information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Full Name</label>
              <Input defaultValue={user?.full_name || ""} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                defaultValue={user?.email || ""}
                disabled
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Bio</label>
            <textarea
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              rows={3}
              placeholder="Tell students about yourself..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>Choose how you want to be notified</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email: New Contributions</p>
              <p className="text-sm text-muted-foreground">
                Get notified when students submit content
              </p>
            </div>
            <Switch
              checked={notifications.emailContributions}
              onCheckedChange={(checked) =>
                setNotifications((prev) => ({
                  ...prev,
                  emailContributions: checked,
                }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email: Review Results</p>
              <p className="text-sm text-muted-foreground">
                Get notified about approved/rejected content
              </p>
            </div>
            <Switch
              checked={notifications.emailReviews}
              onCheckedChange={(checked) =>
                setNotifications((prev) => ({ ...prev, emailReviews: checked }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Push: New Contributions</p>
              <p className="text-sm text-muted-foreground">
                Browser push notifications for new submissions
              </p>
            </div>
            <Switch
              checked={notifications.pushContributions}
              onCheckedChange={(checked) =>
                setNotifications((prev) => ({
                  ...prev,
                  pushContributions: checked,
                }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Push: Review Results</p>
              <p className="text-sm text-muted-foreground">
                Browser push notifications for review updates
              </p>
            </div>
            <Switch
              checked={notifications.pushReviews}
              onCheckedChange={(checked) =>
                setNotifications((prev) => ({ ...prev, pushReviews: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Teaching Preferences
          </CardTitle>
          <CardDescription>Customize your teaching workflow</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto-approve Low-risk Content</p>
              <p className="text-sm text-muted-foreground">
                Automatically approve content from trusted contributors
              </p>
            </div>
            <Switch
              checked={preferences.autoApprove}
              onCheckedChange={(checked) =>
                setPreferences((prev) => ({ ...prev, autoApprove: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Appearance
          </CardTitle>
          <CardDescription>Customize how ATLAS looks for you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Dark Mode</p>
              <p className="text-sm text-muted-foreground">
                Use dark theme across the platform
              </p>
            </div>
            <Switch
              checked={preferences.darkMode}
              onCheckedChange={(checked) =>
                setPreferences((prev) => ({ ...prev, darkMode: checked }))
              }
            />
          </div>
          <div>
            <label className="text-sm font-medium">Language</label>
            <select className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm sm:w-48">
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
