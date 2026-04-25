import { Button } from "@/components/ui/button";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <WifiOff className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold">You&apos;re Offline</h1>
        <p className="mt-2 text-muted-foreground">
          It looks like you&apos;ve lost your internet connection. Please check
          your network settings and try again.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/">Go Home</Link>
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}
