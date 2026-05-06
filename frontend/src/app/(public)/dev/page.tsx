"use client";

import Link from "next/link";
import { GraduationCap, Code, Terminal, Box, Cpu, Globe, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DevPortalPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Developer Portal</h1>
          <p className="mt-2 text-muted-foreground">
            Resources for building on top of Atlas
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                API Documentation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Complete API reference with endpoints, authentication, and code examples
              </p>
              <Button className="mt-4" asChild>
                <Link href="/api/docs">View API Docs</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Open Source
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Atlas is open source. Contribute on GitHub
              </p>
              <Button variant="outline" className="mt-4" asChild>
                <a href="https://github.com/atlas" target="_blank" rel="noopener">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  GitHub
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Box className="h-5 w-5" />
                SDKs & Libraries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Official client libraries for Python, JavaScript, and more
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Status Page
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Real-time system status and incident reports
              </p>
              <Button variant="outline" className="mt-4" asChild>
                <Link href="/status">View Status</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}