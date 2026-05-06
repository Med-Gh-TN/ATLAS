"use client";

import { BookOpen, FileText, Upload, Shield, AlertCircle, CheckCircle2, UserCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/use-translation";

export default function TeacherGuidelinesPage() {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{t("teacher.guidelines")}</h1>
          <p className="mt-2 text-muted-foreground">
            {t("teacher.guidelinesDescription")}
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                {t("teacher.uploadGuidelines")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-500" />
                  <span>{t("teacher.guidelineOriginal")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-500" />
                  <span>{t("teacher.guidelineCitations")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-500" />
                  <span>{t("teacher.guidelineFormats")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-500" />
                  <span>{t("teacher.guidelineMetadata")}</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {t("teacher.moderationRules")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-yellow-500" />
                  <span>{t("teacher.moderationReview")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-yellow-500" />
                  <span>{t("teacher.moderationReject")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-yellow-500" />
                  <span>{t("teacher.moderationFlag")}</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                {t("teacher.contributorApproval")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("teacher.contributorApprovalDescription")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}