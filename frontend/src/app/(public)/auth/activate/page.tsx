import type { Metadata } from "next";
import { OTPInput } from "@/components/ui/otp-input";

export const metadata: Metadata = {
  title: "Activate Account",
  description: "Verify your student account with the one-time code sent to your email.",
};

export default function StudentActivatePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-6 py-16">
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-blue-700">Student Activation</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Enter your verification code</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This route restores the required `/auth/activate` path so the frontend route map matches the frozen contract.
        </p>
        <div className="mt-8">
          <OTPInput value="" onChange={() => {}} />
        </div>
      </div>
    </main>
  );
}
