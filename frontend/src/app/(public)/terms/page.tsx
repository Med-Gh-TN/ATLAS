"use client";

import { GraduationCap, FileText, AlertTriangle, Users, Ban, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FileText className="h-8 w-8" />
            Terms of Service
          </h1>
          <p className="mt-2 text-muted-foreground">
            The rules for using Atlas
          </p>
          <p className="text-sm text-muted-foreground">Last updated: April 2026</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Acceptance of Terms</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                By creating an Atlas account, you agree to these terms. If you don't agree,
                don't use Atlas.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Your Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>You're responsible for your account security</li>
                <li>Provide accurate information</li>
                <li>You're at least 16 years old (or have parental consent)</li>
                <li>One account per person</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Acceptable Use
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="font-medium">You agree NOT to:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Post illegal or harmful content</li>
                <li>Violate others' rights</li>
                <li>Share copyrighted material without permission</li>
                <li>Attempt to hack or disrupt the platform</li>
                <li>Create multiple accounts</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Content & Contributions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>You retain ownership of your uploads</li>
                <li>By uploading, you grant Atlas a license to share</li>
                <li>All contributions are moderated</li>
                <li>We can remove content violations</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Termination</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                We can suspend or terminate your account if you violate these terms
                or for any other reason with notice.
              </p>
            </CardContent>
          </Card>

          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm">
              Questions? Contact us at <span className="font-medium">support@atlas.tn</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}