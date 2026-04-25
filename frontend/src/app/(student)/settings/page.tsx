"use client";

import { useState } from "react";
import { Moon, Sun, Globe, Bell, Shield, Palette, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useUIStore } from "@/store/auth.store";

export default function SettingsPage() {
  const { theme, setTheme, isRTL, toggleRTL } = useUIStore();
  const [notifications, setNotifications] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);
  const [language, setLanguage] = useState("fr");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Customize your experience</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Appearance
            </CardTitle>
            <CardDescription>Customize how ATLAS looks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Theme</label>
              <div className="flex gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setTheme("light")}
                >
                  <Sun className="h-4 w-4 mr-2" />
                  Light
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="h-4 w-4 mr-2" />
                  Dark
                </Button>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setTheme("system")}
                >
                  <Monitor className="h-4 w-4 mr-2" />
                  System
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <div className="flex gap-2">
                <Button
                  variant={language === "fr" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setLanguage("fr")}
                >
                  Français
                </Button>
                <Button
                  variant={language === "en" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setLanguage("en")}
                >
                  English
                </Button>
                <Button
                  variant={language === "ar" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setLanguage("ar")}
                >
                  العربية
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Right-to-Left Layout</p>
                <p className="text-sm text-muted-foreground">
                  Switch text direction
                </p>
              </div>
              <Button variant="outline" onClick={toggleRTL}>
                {isRTL ? "RTL" : "LTR"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>
              Manage your notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Push Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Receive notifications in your browser
                </p>
              </div>
              <Button
                variant={notifications ? "default" : "outline"}
                size="sm"
                onClick={() => setNotifications(!notifications)}
              >
                {notifications ? "On" : "Off"}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email Digest</p>
                <p className="text-sm text-muted-foreground">
                  Weekly summary of your activity
                </p>
              </div>
              <Button
                variant={emailDigest ? "default" : "outline"}
                size="sm"
                onClick={() => setEmailDigest(!emailDigest)}
              >
                {emailDigest ? "On" : "Off"}
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notification Types</label>
              <div className="space-y-2">
                {[
                  "New contributions",
                  "Achievements",
                  "Study reminders",
                  "Leaderboard updates",
                ].map((type) => (
                  <label key={type} className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" defaultChecked />
                    <span className="text-sm">{type}</span>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Privacy & Security
            </CardTitle>
            <CardDescription>Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full" asChild>
              <a href="/auth/forgot-password">Change Password</a>
            </Button>
            <Button variant="outline" className="w-full">
              Enable Two-Factor Authentication
            </Button>
            <Button variant="outline" className="w-full">
              Download My Data
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About ATLAS</CardTitle>
            <CardDescription>Application information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span>1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Build</span>
              <span className="font-mono text-sm">2024.03.1</span>
            </div>
            <div className="pt-2 border-t">
              <Button variant="outline" className="w-full" size="sm">
                Check for Updates
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
