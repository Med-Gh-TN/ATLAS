"use client";

import { useState } from "react";
import {
  Bell,
  Globe,
  Moon,
  Palette,
  Save,
  Shield,
  SlidersHorizontal,
  Sun,
  Monitor,
  Eye,
  EyeOff,
  KeyRound,
  Languages,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore, useUIStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/use-translation";
import { authApi } from "@/lib/api";

export default function AdminSettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme, isRTL, toggleRTL } = useUIStore();
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [notifications, setNotifications] = useState({
    emailNewContributions: true,
    emailTeacherRequests: true,
    emailReports: true,
    pushModerationAlerts: true,
    pushSystemAlerts: false,
    weeklyDigest: true,
  });

  const [platformPrefs, setPlatformPrefs] = useState({
    autoApproveTrusted: true,
    strictDocumentScan: true,
    publicRegistration: true,
    maintenanceMode: false,
    defaultLanguage: "fr",
  });

  const [security, setSecurity] = useState({
    require2FAForAdmins: false,
    forcePasswordReset: false,
    sessionTimeout: "60",
  });

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const togglePlatformPref = (key: keyof typeof platformPrefs) => {
    setPlatformPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.adminSettings")}</h1>
        <p className="text-muted-foreground">
          {t("account.yourAccountDetails")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t("account.profile")}
            </CardTitle>
            <CardDescription>
              {t("account.yourAccountDetails")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">{t("account.fullName")}</label>
                <Input defaultValue={user?.full_name || ""} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">{t("account.email")}</label>
                <Input defaultValue={user?.email || ""} disabled className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("account.role")}</label>
              <div className="mt-1 flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm">
                <Shield className="h-4 w-4 text-primary" />
                {t("sidebar.admins")}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("admin.changePassword")}</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("admin.newPasswordPlaceholder")}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appearance Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              {t("student.theme")}
            </CardTitle>
            <CardDescription>{t("admin.customizePanel")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("student.theme")}</label>
              <div className="flex gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setTheme("light")}
                >
                  <Sun className="mr-2 h-4 w-4" />
                  {t("student.light")}
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="mr-2 h-4 w-4" />
                  {t("student.dark")}
                </Button>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setTheme("system")}
                >
                  <Monitor className="mr-2 h-4 w-4" />
                  {t("student.system")}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t("admin.defaultPlatformLanguage")}</label>
              <div className="flex gap-2">
                {[
                  { code: "fr", label: t("languageNames.fr") },
                  { code: "en", label: t("languageNames.en") },
                  { code: "ar", label: t("languageNames.ar") },
                ].map((lang) => (
                  <Button
                    key={lang.code}
                    variant={platformPrefs.defaultLanguage === lang.code ? "default" : "outline"}
                    className="flex-1"
                    onClick={() =>
                      setPlatformPrefs((prev) => ({ ...prev, defaultLanguage: lang.code }))
                    }
                  >
                    <Languages className="mr-2 h-4 w-4" />
                    {lang.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t("admin.rtlLayout")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("admin.rtlDescription")}
                </p>
              </div>
              <Button variant="outline" onClick={toggleRTL}>
                {isRTL ? "RTL" : "LTR"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              {t("admin.notificationPreferences")}
            </CardTitle>
            <CardDescription>
              {t("admin.notificationDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                key: "emailNewContributions" as const,
                title: t("admin.emailNewContributions"),
                desc: t("admin.emailNewContributionsDesc"),
              },
              {
                key: "emailTeacherRequests" as const,
                title: t("admin.emailTeacherRequests"),
                desc: t("admin.emailTeacherRequestsDesc"),
              },
              {
                key: "emailReports" as const,
                title: t("admin.emailReports"),
                desc: t("admin.emailReportsDesc"),
              },
              {
                key: "pushModerationAlerts" as const,
                title: t("admin.pushModerationAlerts"),
                desc: t("admin.pushModerationAlertsDesc"),
              },
              {
                key: "pushSystemAlerts" as const,
                title: t("admin.pushSystemAlerts"),
                desc: t("admin.pushSystemAlertsDesc"),
              },
              {
                key: "weeklyDigest" as const,
                title: t("admin.weeklyDigest"),
                desc: t("admin.weeklyDigestDesc"),
              },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={notifications[item.key]}
                  onCheckedChange={() => toggleNotification(item.key)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Platform Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5" />
              {t("admin.platformRules")}
            </CardTitle>
            <CardDescription>
              {t("admin.platformRulesDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                key: "autoApproveTrusted" as const,
                title: t("admin.autoApproveTrusted"),
                desc: t("admin.autoApproveTrustedDesc"),
              },
              {
                key: "strictDocumentScan" as const,
                title: t("admin.strictDocumentScan"),
                desc: t("admin.strictDocumentScanDesc"),
              },
              {
                key: "publicRegistration" as const,
                title: t("admin.publicRegistration"),
                desc: t("admin.publicRegistrationDesc"),
              },
              {
                key: "maintenanceMode" as const,
                title: t("admin.maintenanceMode"),
                desc: t("admin.maintenanceModeDesc"),
              },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={platformPrefs[item.key]}
                  onCheckedChange={() => togglePlatformPref(item.key)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Security Policies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              {t("admin.securityPolicies")}
            </CardTitle>
            <CardDescription>
              {t("admin.securityPoliciesDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t("admin.require2FA")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("admin.require2FADesc")}
                </p>
              </div>
              <Switch
                checked={security.require2FAForAdmins}
                onCheckedChange={(checked) =>
                  setSecurity((prev) => ({ ...prev, require2FAForAdmins: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t("admin.forcePasswordReset")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("admin.forcePasswordResetDesc")}
                </p>
              </div>
              <Switch
                checked={security.forcePasswordReset}
                onCheckedChange={(checked) =>
                  setSecurity((prev) => ({ ...prev, forcePasswordReset: checked }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("admin.sessionTimeout")}
              </label>
              <Input
                type="number"
                value={security.sessionTimeout}
                onChange={(e) =>
                  setSecurity((prev) => ({ ...prev, sessionTimeout: e.target.value }))
                }
                min={5}
                max={240}
              />
            </div>
          </CardContent>
        </Card>

        {/* About / System */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {t("admin.aboutAtlas")}
            </CardTitle>
            <CardDescription>{t("admin.aboutDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("admin.version")}</span>
              <span>1.0.0-beta.2</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("admin.build")}</span>
              <span className="font-mono text-sm">2026.04.22</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("admin.environment")}</span>
              <span className="font-mono text-sm">Development</span>
            </div>
            <div className="border-t pt-2">
              <Button variant="outline" className="w-full" size="sm">
                {t("admin.checkForUpdates")}
              </Button>
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
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} size="lg">
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
