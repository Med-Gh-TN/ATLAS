"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Bell, Shield, Palette, Monitor, Loader2, AlertTriangle, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/store/auth.store";
import { useRTL, useTheme } from "@/hooks/use-rtl";
import { useTranslation } from "@/hooks/use-translation";
import { authApi } from "@/lib/api";
import { useVoiceSettingsStore, TutorVoice } from "@/store/voice-settings.store";

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const { lang, setLanguage, isRTL, toggleRTL } = useRTL();
  const { t } = useTranslation();
  
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { voice, setVoice } = useVoiceSettingsStore();

  useEffect(() => {
    if (user && user.is_rtl !== isRTL) {
      // Backend sync not forced here, store is authority
    }
  }, [user, isRTL]);

  const handleUpdate = async (field: string, value: any) => {
    if (!user) return;
    
    setIsSaving(field);
    try {
      const updatedUser = await authApi.updateProfile({ [field]: value });
      setUser(updatedUser);
    } catch (error) {
      console.error("Failed to update settings:", error);
    } finally {
      setIsSaving(null);
    }
  };

  const handleToggleNotificationType = async (type: string) => {
    if (!user) return;
    
    const currentTypes = user.notification_types || [];
    const nextTypes = currentTypes.includes(type)
      ? currentTypes.filter(t => t !== type)
      : [...currentTypes, type];
    
    await handleUpdate("notification_types", nextTypes);
  };

  if (!user) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("account.settings")}</h1>
        <p className="text-muted-foreground">Customize your experience</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              {t("account.appearance")}
            </CardTitle>
            <CardDescription>Customize how ATLAS looks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Theme</label>
              <div className="flex gap-2">
                {(["light", "dark", "system"] as const).map((t) => (
                  <Button
                    key={t}
                    variant={theme === t ? "default" : "outline"}
                    className="flex-1 capitalize"
                    onClick={() => setTheme(t)}
                  >
                    {t === "light" && <Sun className="h-4 w-4 mr-2" />}
                    {t === "dark" && <Moon className="h-4 w-4 mr-2" />}
                    {t === "system" && <Monitor className="h-4 w-4 mr-2" />}
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t("account.language")}</label>
              <div className="flex gap-2">
                {[
                  { id: "fr", label: "Français" },
                  { id: "en", label: "English" },
                  { id: "ar", label: "العربية" },
                ].map((l) => (
                  <Button
                    key={l.id}
                    variant={lang === l.id ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => {
                      setLanguage(l.id as any);
                      handleUpdate("preferred_language", l.id);
                    }}
                    disabled={isSaving === "preferred_language"}
                  >
                    {isSaving === "preferred_language" && lang === l.id && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
                    {l.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Right-to-Left Layout</p>
                <p className="text-sm text-muted-foreground">
                  Switch text direction
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => {
                  toggleRTL();
                  handleUpdate("is_rtl", !isRTL);
                }}
                disabled={isSaving === "is_rtl"}
              >
                {isSaving === "is_rtl" && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
                {isRTL ? "RTL (Enabled)" : "LTR (Default)"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI Tutor Voice — Updated with Charon */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              AI Tutor Voice
            </CardTitle>
            <CardDescription>
              Choose the personality of your study companion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Voice</label>
              <div className="flex gap-2">
                <Button
                  variant={voice === "Zephyr" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setVoice("Zephyr")}
                >
                  ♀ Zephyr
                </Button>
                <Button
                  variant={voice === "Charon" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setVoice("Charon")}
                >
                  ♂ Charon
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Zephyr is a bright, cheerful female voice. Charon is a deep, warm, masculine voice — calm and trustworthy like Miles. Change takes effect on the next tutor connection.
            </p>
          </CardContent>
        </Card>

        {/* Notifications (unchanged) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              {t("account.notifications")}
            </CardTitle>
            <CardDescription>
              {t("account.emailNotifications")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Push Notifications</p>
                <p className="text-sm text-muted-foreground">
                  {t("account.pushNotifications")}
                </p>
              </div>
              <Button
                variant={user.push_notifications_enabled ? "default" : "outline"}
                size="sm"
                onClick={() => handleUpdate("push_notifications_enabled", !user.push_notifications_enabled)}
                disabled={isSaving === "push_notifications_enabled"}
              >
                {isSaving === "push_notifications_enabled" && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
                {user.push_notifications_enabled ? "On" : "Off"}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email Digest</p>
                <p className="text-sm text-muted-foreground">
                  {t("student.weeklyProgress")}
                </p>
              </div>
              <Button
                variant={user.email_digest_enabled ? "default" : "outline"}
                size="sm"
                onClick={() => handleUpdate("email_digest_enabled", !user.email_digest_enabled)}
                disabled={isSaving === "email_digest_enabled"}
              >
                {isSaving === "email_digest_enabled" && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
                {user.email_digest_enabled ? "On" : "Off"}
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notification Types</label>
              <div className="space-y-2">
                {[
                  { id: "contributions", label: "New contributions" },
                  { id: "achievements", label: "Achievements" },
                  { id: "reminders", label: "Study reminders" },
                  { id: "leaderboard", label: "Leaderboard updates" },
                ].map((type) => (
                  <label key={type.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded transition-colors">
                    <input 
                      type="checkbox" 
                      className="rounded border-primary text-primary focus:ring-primary" 
                      checked={user.notification_types?.includes(type.id)}
                      onChange={() => handleToggleNotificationType(type.id)}
                      disabled={isSaving === "notification_types"}
                    />
                    <span className="text-sm">{type.label}</span>
                    {isSaving === "notification_types" && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security (unchanged) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Shield className="h-5 w-5" />
              {t("account.dangerZone")}
            </CardTitle>
            <CardDescription>{t("account.irreversibleActions")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">
                {t("account.deleteWarning")}
              </p>
            </div>
            <Button variant="destructive" className="w-full" onClick={() => setDeleteOpen(true)}>
              {t("account.deleteMyAccount")}
            </Button>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    {t("account.deleteAccount")}
                  </DialogTitle>
                  <DialogDescription>
                    {t("account.deleteAccountConfirm")}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                    {t("account.cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={isDeleting}
                    onClick={async () => {
                      setIsDeleting(true);
                      try {
                        await authApi.deleteAccount();
                        setDeleteOpen(false);
                        window.location.href = "/";
                      } catch (error) {
                        console.error("Failed to delete account:", error);
                        alert(t("account.deleteFailed"));
                      } finally {
                        setIsDeleting(false);
                      }
                    }}
                  >
                    {isDeleting ? t("account.deleting") : t("account.deleteMyAccount")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* About (unchanged) */}
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
              <span className="font-mono text-sm">2024.04.22</span>
            </div>
            <div className="pt-2 border-t">
              <Button variant="outline" className="w-full" size="sm" disabled>
                Check for Updates
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}