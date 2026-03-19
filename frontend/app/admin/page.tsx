// Comprehensive, production-ready code with clear JSDoc/Docstring comments.
// ENTIRE FILE CONTENTS HERE. NO PLACEHOLDERS.
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/store/useAuthStore";

/**
 * Admin Dashboard Landing Page
 * Serves as the primary workspace post-login for users with the ADMIN role.
 * Mirrors the visual architecture of the Student Dashboard for UI consistency,
 * but surfaces privileged role-based routing (Moderation, Teacher Import).
 */
export default function AdminDashboardPage() {
    const router = useRouter();
    const { user, isAuthenticated } = useAuthStore();
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);

    // Defensive Architecture: Strict Client-Side Role Guard
    useEffect(() => {
        if (!isAuthenticated || !user) {
            router.replace("/auth/login?session_expired=true");
        } else if (user.role?.toUpperCase() !== "ADMIN") {
            // If a non-admin bypasses middleware (e.g., cached route), bounce them out
            if (user.role?.toUpperCase() === "TEACHER") {
                router.replace("/upload");
            } else {
                router.replace("/dashboard");
            }
        } else {
            setIsCheckingAuth(false);
        }
    }, [isAuthenticated, user, router]);

    if (isCheckingAuth) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-50">
                <div className="w-8 h-8 border-4 border-neutral-300 border-t-red-700 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                
                <section className="mb-10 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                            Admin Control Center
                        </h1>
                        <p className="mt-2 text-neutral-500">
                            Welcome back, {user?.email?.split('@')[0] || "Administrator"}. Platform systems are running normally.
                        </p>
                    </div>
                    <div className="hidden sm:block">
                        <span className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                            System Admin
                        </span>
                    </div>
                </section>

                {/* Privileged Actions Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/* Moderation Queue Action */}
                    <Link href="/admin/moderation" className="group relative bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md hover:border-red-300 transition-all">
                        <div className="w-12 h-12 bg-red-50 text-red-700 rounded-xl flex items-center justify-center mb-4 group-hover:bg-red-700 group-hover:text-white transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-neutral-900 mb-2">Content Moderation</h3>
                        <p className="text-sm text-neutral-500">
                            Review pending document uploads, manage user reports, and maintain library quality standards.
                        </p>
                    </Link>

                    {/* Teacher Import Action */}
                    <Link href="/admin/teachers/import" className="group relative bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md hover:border-blue-300 transition-all">
                        <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-700 group-hover:text-white transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-neutral-900 mb-2">Teacher Onboarding</h3>
                        <p className="text-sm text-neutral-500">
                            Batch import faculty accounts via CSV, manage teacher access credentials, and audit permissions.
                        </p>
                    </Link>

                    {/* Platform Analytics / System Health (Placeholder for future expansion) */}
                    <div className="group relative bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 opacity-70 cursor-not-allowed">
                        <div className="w-12 h-12 bg-neutral-100 text-neutral-500 rounded-xl flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-neutral-900 mb-2 flex items-center gap-2">
                            Platform Analytics <span className="text-[10px] font-bold bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded uppercase tracking-wider">Coming Soon</span>
                        </h3>
                        <p className="text-sm text-neutral-500">
                            Global metrics covering user growth, search vector performance, and system health status.
                        </p>
                    </div>

                </div>

                {/* Audit Log / Recent Activity Placeholder */}
                <section className="mt-12">
                    <h2 className="text-xl font-bold tracking-tight text-neutral-900 mb-6">Recent System Activity</h2>
                    <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-center">
                        <p className="text-sm text-neutral-500">System audit logs and recent moderation actions will appear here.</p>
                    </div>
                </section>
                
            </main>
        </div>
    );
}