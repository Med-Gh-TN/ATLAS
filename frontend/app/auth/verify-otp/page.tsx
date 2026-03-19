"use client";

import React, { useState, useEffect, useRef, FormEvent, ClipboardEvent, KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
// Assuming a standard Axios or Fetch wrapper exists in lib/api per the directory tree
import api from "@/lib/api";

/**
 * US-03: Student OTP Verification Page
 * Features a 6-digit split input, resilient 24h countdown timer, and secure API integration.
 */
export default function VerifyOTPPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const email = searchParams.get("email") || "";

    const [otp, setOtp] = useState<string[]>(new Array(6).fill(""));
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [resendLoading, setResendLoading] = useState<boolean>(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    
    // Timer State (24 Hours = 86400 seconds)
    const [timeLeft, setTimeLeft] = useState<number>(86400); 
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // 1. Initialize and Manage the 24-Hour Countdown Timer resiliently
    useEffect(() => {
        if (!email) {
            setError("No email address provided. Please return to registration.");
            return;
        }

        const storageKey = `atlas_otp_expiry_${email}`;
        const storedExpiry = localStorage.getItem(storageKey);
        
        let expiryTime: number;
        if (storedExpiry) {
            expiryTime = parseInt(storedExpiry, 10);
        } else {
            // Set expiry to 24 hours from now
            expiryTime = Date.now() + 86400 * 1000;
            localStorage.setItem(storageKey, expiryTime.toString());
        }

        const updateTimer = () => {
            const now = Date.now();
            const remainingSeconds = Math.max(0, Math.floor((expiryTime - now) / 1000));
            setTimeLeft(remainingSeconds);
            
            if (remainingSeconds === 0) {
                setError("Your verification code has expired. Please request a new one.");
            }
        };

        updateTimer();
        const intervalId = setInterval(updateTimer, 1000);
        return () => clearInterval(intervalId);
    }, [email]);

    // 2. Format remaining time into HH:MM:SS
    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // 3. OTP Input Interactions (Change, Paste, Backspace)
    const handleChange = (element: HTMLInputElement, index: number) => {
        if (isNaN(Number(element.value))) return;

        const newOtp = [...otp];
        newOtp[index] = element.value;
        setOtp(newOtp);

        // Auto-focus next input
        if (element.value !== "" && index < 5 && inputRefs.current[index + 1]) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
        if (e.key === "Backspace" && !otp[index] && index > 0 && inputRefs.current[index - 1]) {
            // Auto-focus previous input on backspace if current is empty
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData("text/plain").slice(0, 6).split("");
        if (pastedData.some(char => isNaN(Number(char)))) return;

        const newOtp = [...otp];
        pastedData.forEach((char, index) => {
            if (index < 6) newOtp[index] = char;
        });
        setOtp(newOtp);
        
        // Focus the appropriate input after paste
        const focusIndex = Math.min(pastedData.length, 5);
        inputRefs.current[focusIndex]?.focus();
    };

    // 4. API Core Logic: Verification
    const handleVerify = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        const otpCode = otp.join("");
        if (otpCode.length !== 6) {
            setError("Please enter the complete 6-digit code.");
            return;
        }

        setLoading(true);
        try {
            // Aligning with standard REST conventions for the ATLAS backend
            await api.post("/auth/verify-otp", { email, code: otpCode });
            
            // Cleanup local state and redirect to login
            localStorage.removeItem(`atlas_otp_expiry_${email}`);
            setSuccessMessage("Account successfully verified. Redirecting...");
            
            setTimeout(() => {
                router.push("/auth/login?verified=true");
            }, 1500);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Verification failed. The code may be invalid or expired.");
            // Reset inputs on failure
            setOtp(new Array(6).fill(""));
            inputRefs.current[0]?.focus();
        } finally {
            setLoading(false);
        }
    };

    // 5. API Core Logic: Resend OTP
    const handleResend = async () => {
        if (!email) return;
        setError(null);
        setResendLoading(true);
        try {
            await api.post("/auth/resend-otp", { email });
            // Reset timer locally
            const newExpiryTime = Date.now() + 86400 * 1000;
            localStorage.setItem(`atlas_otp_expiry_${email}`, newExpiryTime.toString());
            setTimeLeft(86400);
            setSuccessMessage("A new verification code has been sent to your email.");
            setOtp(new Array(6).fill(""));
            inputRefs.current[0]?.focus();
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to resend the code. Please try again later.");
        } finally {
            setResendLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg border border-gray-100">
                
                <div className="text-center">
                    <h2 className="mt-2 text-3xl font-extrabold text-gray-900 tracking-tight">
                        Verify your account
                    </h2>
                    <p className="mt-4 text-sm text-gray-600">
                        We sent a 6-digit code to <span className="font-semibold text-gray-900">{email || "your email"}</span>.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
                        <p className="text-sm text-red-700 font-medium">{error}</p>
                    </div>
                )}

                {successMessage && (
                    <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-md">
                        <p className="text-sm text-green-700 font-medium">{successMessage}</p>
                    </div>
                )}

                <form className="mt-8 space-y-6" onSubmit={handleVerify}>
                    <div className="flex justify-between gap-2">
                        {otp.map((digit, index) => (
                            <input
                                key={index}
                                type="text"
                                maxLength={1}
                                value={digit}
                                ref={(el) => { inputRefs.current[index] = el; }}
                                onChange={(e) => handleChange(e.target, index)}
                                onKeyDown={(e) => handleKeyDown(e, index)}
                                onPaste={handlePaste}
                                disabled={loading || timeLeft === 0}
                                className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black disabled:opacity-50 transition-all"
                            />
                        ))}
                    </div>

                    <div className="flex items-center justify-between text-sm mt-4">
                        <span className="text-gray-500">Code expires in:</span>
                        <span className={`font-mono font-bold ${timeLeft < 3600 ? 'text-red-600' : 'text-gray-900'}`}>
                            {formatTime(timeLeft)}
                        </span>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || otp.join("").length !== 6 || timeLeft === 0}
                        className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 transition-colors"
                    >
                        {loading ? "Verifying..." : "Verify Account"}
                    </button>
                </form>

                <div className="mt-6 border-t border-gray-100 pt-6 text-center">
                    <p className="text-sm text-gray-600">
                        Didn't receive the code?{" "}
                        <button 
                            onClick={handleResend}
                            disabled={resendLoading}
                            className="font-semibold text-black hover:underline disabled:opacity-50"
                        >
                            {resendLoading ? "Sending..." : "Resend OTP"}
                        </button>
                    </p>
                    <div className="mt-4">
                        <Link href="/auth/register" className="text-sm font-medium text-gray-500 hover:text-gray-900">
                            &larr; Back to Registration
                        </Link>
                    </div>
                </div>

            </div>
        </div>
    );
}