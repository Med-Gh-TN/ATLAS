"use client";

import { useState } from "react";
import {
  Settings,
  Bell,
  Shield,
  Database,
  Globe,
  Key,
  Save,
  AlertTriangle,
} from "lucide-react";
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

export default function AdminSettings() {
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  const tabs = [
    { id: "general", label: "General", icon: Settings },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
    { id: "system", label: "System", icon: Database },
  ];

  const [settings, setSettings] = useState({
    siteName: "ATLAS",
    siteUrl: "https://atlas.tn",
    maintenanceMode: false,
    allowRegistration: true,
    requireEmailVerification: true,
    maxUploadSize: 50,
    allowedFileTypes: ".pdf,.doc,.docx,.txt",
    emailNotifications: true,
    pushNotifications: true,
    twoFactorRequired: false,
    sessionTimeout: 24,
    passwordMinLength: 8,
    backupEnabled: true,
    backupFrequency: "daily",
  });

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-muted-foreground">
          Configure platform-wide settings and preferences
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="lg:w-64">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 space-y-6">
          {activeTab === "general" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    General Settings
                  </CardTitle>
                  <CardDescription>
                    Basic platform configuration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Platform Name</label>
                    <Input
                      value={settings.siteName}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, siteName: e.target.value }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Platform URL</label>
                    <Input
                      value={settings.siteUrl}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, siteUrl: e.target.value }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Maintenance Mode</p>
                      <p className="text-sm text-muted-foreground">
                        Disable platform for non-admin users
                      </p>
                    </div>
                    <Switch
                      checked={settings.maintenanceMode}
                      onCheckedChange={(checked) =>
                        setSettings((s) => ({ ...s, maintenanceMode: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Allow New Registrations</p>
                      <p className="text-sm text-muted-foreground">
                        Let new users create accounts
                      </p>
                    </div>
                    <Switch
                      checked={settings.allowRegistration}
                      onCheckedChange={(checked) =>
                        setSettings((s) => ({
                          ...s,
                          allowRegistration: checked,
                        }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    File Upload Settings
                  </CardTitle>
                  <CardDescription>
                    Configure file upload restrictions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">
                      Max Upload Size (MB)
                    </label>
                    <Input
                      type="number"
                      value={settings.maxUploadSize}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          maxUploadSize: parseInt(e.target.value),
                        }))
                      }
                      className="mt-1 w-32"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      Allowed File Types
                    </label>
                    <Input
                      value={settings.allowedFileTypes}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          allowedFileTypes: e.target.value,
                        }))
                      }
                      className="mt-1"
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "notifications" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Settings
                </CardTitle>
                <CardDescription>
                  Configure system-wide notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Send email notifications to users
                    </p>
                  </div>
                  <Switch
                    checked={settings.emailNotifications}
                    onCheckedChange={(checked) =>
                      setSettings((s) => ({
                        ...s,
                        emailNotifications: checked,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Push Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Enable browser push notifications
                    </p>
                  </div>
                  <Switch
                    checked={settings.pushNotifications}
                    onCheckedChange={(checked) =>
                      setSettings((s) => ({ ...s, pushNotifications: checked }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "security" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Security Settings
                  </CardTitle>
                  <CardDescription>Configure security policies</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Require 2FA for Admins</p>
                      <p className="text-sm text-muted-foreground">
                        Force two-factor authentication for admin accounts
                      </p>
                    </div>
                    <Switch
                      checked={settings.twoFactorRequired}
                      onCheckedChange={(checked) =>
                        setSettings((s) => ({
                          ...s,
                          twoFactorRequired: checked,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      Session Timeout (hours)
                    </label>
                    <Input
                      type="number"
                      value={settings.sessionTimeout}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          sessionTimeout: parseInt(e.target.value),
                        }))
                      }
                      className="mt-1 w-32"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      Minimum Password Length
                    </label>
                    <Input
                      type="number"
                      value={settings.passwordMinLength}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          passwordMinLength: parseInt(e.target.value),
                        }))
                      }
                      className="mt-1 w-32"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    API Keys
                  </CardTitle>
                  <CardDescription>Manage API access keys</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-dashed p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      No API keys configured
                    </p>
                    <Button variant="outline" className="mt-2" size="sm">
                      Generate New Key
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "system" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Backup Settings
                  </CardTitle>
                  <CardDescription>Configure automated backups</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Enable Automatic Backups</p>
                      <p className="text-sm text-muted-foreground">
                        Schedule automatic database backups
                      </p>
                    </div>
                    <Switch
                      checked={settings.backupEnabled}
                      onCheckedChange={(checked) =>
                        setSettings((s) => ({ ...s, backupEnabled: checked }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      Backup Frequency
                    </label>
                    <select
                      value={settings.backupFrequency}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          backupFrequency: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm sm:w-48"
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    Danger Zone
                  </CardTitle>
                  <CardDescription>
                    Irreversible actions - proceed with caution
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start">
                    Clear Cache
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    Reset All User Progress
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full justify-start"
                  >
                    Delete All Data
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

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
      </div>
    </div>
  );
}
