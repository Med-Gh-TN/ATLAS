"use client";

import { GraduationCap, Shield, Eye, Lock, User, Trash2, Mail, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="h-8 w-8" />
            Privacy Policy
          </h1>
          <p className="mt-2 text-muted-foreground">
            How we collect, use, and protect your data
          </p>
          <p className="text-sm text-muted-foreground">Last updated: April 2026</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Information We Collect
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Account information (name, email, institution)</li>
                <li>Learning activity and progress data</li>
                <li>Content you upload or contribute</li>
                <li>Device and usage information</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                How We Use Your Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Provide and improve Atlas services</li>
                <li>Personalize your learning experience</li>
                <li>Send important notifications</li>
                <li>Analyze platform usage for improvements</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Data Protection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                We use industry-standard encryption and security measures to protect your data. 
                Your information is stored on secure servers in Tunisia and Germany.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Your Rights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Access your data at any time</li>
                <li>Request data deletion</li>
                <li>Export your data</li>
                <li>Opt-out of non-essential communications</li>
              </ul>
            </CardContent>
          </Card>

          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm">
              Questions? Contact us at <span className="font-medium">privacy@atlas.tn</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}