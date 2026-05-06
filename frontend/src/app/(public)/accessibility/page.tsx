"use client";

import { GraduationCap, Accessibility, Eye, Ear, Brain, Keyboard, Monitor, Smartphone, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccessibilityPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Accessibility className="h-8 w-8" />
            Accessibility Statement
          </h1>
          <p className="mt-2 text-muted-foreground">
            Atlas is committed to digital accessibility for everyone
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Visual Accessibility
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>High contrast mode available</li>
                <li>Adjustable text sizes</li>
                <li>Screen reader compatible</li>
                <li>Keyboard navigation support</li>
                <li>Reduced motion option</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ear className="h-5 w-5" />
                Auditory Accessibility
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>All videos have captions</li>
                <li>Text alternatives for audio content</li>
                <li>Visual notifications for sounds</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="h-5 w-5" />
                Motor Accessibility
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Full keyboard support</li>
                <li>No time-limited interactions</li>
                <li>Skip navigation links</li>
                <li>Focus indicators visible</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Cognitive Accessibility
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Clear, simple language</li>
                <li>Consistent navigation</li>
                <li>Error prevention and recovery</li>
                <li>Help and documentation available</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Device Compatibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  <span>Desktop computers</span>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  <span>Mobile devices</span>
                </div>
                <div className="flex items-center gap-2">
                  <Keyboard className="h-5 w-5" />
                  <span>Tablets</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h3 className="font-medium text-blue-700">Need Assistance?</h3>
            <p className="mt-1 text-sm text-blue-600">
              If you encounter accessibility barriers, contact us at accessibility@atlas.tn
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}