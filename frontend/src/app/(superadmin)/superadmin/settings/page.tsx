"use client";

import { useState } from "react";
import { Shield, Save, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export default function SuperadminSettingsPage() {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{t("account.settings")}</h1>
        <p className="text-muted-foreground">{t("account.yourAccountDetails")}</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("account.profileInformation")}</CardTitle>
            <CardDescription>{t("account.yourAccountDetails")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("account.fullName")}</span>
              <span className="font-medium">{user?.full_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("account.email")}</span>
              <span>{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("account.role")}</span>
              <span className="font-medium">{user?.role}</span>
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
    </div>
  );
}