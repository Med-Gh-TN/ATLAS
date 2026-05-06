"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { GraduationCap, HelpCircle, MessageSquare, Mail, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HelpPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user) {
      router.replace("/docs/guide");
    }
  }, [user, router]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <HelpCircle className="h-8 w-8" />
            Help Center
          </h1>
          <p className="mt-2 text-muted-foreground">
            Find answers and get support
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                User Guide
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Step-by-step guides for using Atlas
              </p>
              <Button className="mt-4" variant="outline" asChild>
                <a href="/docs/guide">View Guide</a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Community Forum
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Connect with other users
              </p>
              <Button className="mt-4" variant="outline">
                <ExternalLink className="mr-2 h-4 w-4" />
                Visit Forum
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Support
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Get help by email
              </p>
              <Button className="mt-4" variant="outline">
                <Mail className="mr-2 h-4 w-4" />
                Contact Us
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                API Documentation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                For developers
              </p>
              <Button className="mt-4" variant="outline" asChild>
                <a href="/api/docs">View API Docs</a>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 rounded-lg border bg-muted/50 p-6">
          <h2 className="text-lg font-semibold">Need to login?</h2>
          <p className="mt-2 text-muted-foreground">
            Sign in to access personalized help and support tickets
          </p>
          <div className="mt-4 flex gap-4">
            <Button asChild>
              <a href="/auth/login">Sign In</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/auth/register">Create Account</a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}