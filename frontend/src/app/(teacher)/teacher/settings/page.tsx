"use client";

import { useState } from "react";
import { Settings, Bell, Globe, Shield, Save, AlertTriangle } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/use-translation";
import { authApi } from "@/lib/api";

export default function TeacherSettings() {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
        <h1 className="text-2xl font-bold">{t("account.settings")}</h1>
        <p className="text-muted-foreground">
          {t("account.yourAccountDetails")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t("account.profile")}
          </CardTitle>
          <CardDescription>{t("account.profileInformation")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">{t("account.fullName")}</label>
              <Input defaultValue={user?.full_name || ""} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">{t("account.email")}</label>
              <Input
                defaultValue={user?.email || ""}
                disabled
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t("account.notifications")}
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
            {t("account.appearance")}
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
            <label className="text-sm font-medium">{t("account.language")}</label>
            <select className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm sm:w-48">
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
            </select>
          </div>
        </CardContent>
      </Card>

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
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => setDeleteOpen(true)}
          >
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

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {t("ui.loading")}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {t("ui.save")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
