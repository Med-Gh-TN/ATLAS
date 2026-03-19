// Comprehensive, production-ready code with clear JSDoc/Docstring comments.
// ENTIRE FILE CONTENTS HERE. NO PLACEHOLDERS.
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/store/useAuthStore";

/**
 * US-04: Polymorphic Dashboard Landing Page
 * Serves as the primary workspace post-login for both STUDENT and TEACHER roles.
 * Renders distinct Quick Action grids based on the authenticated user's RBAC profile.
 */
export default function DashboardPage() {
    const router = useRouter();
    const { user, isAuthenticated } = useAuthStore();
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);

    // Defensive Architecture: Client-side route protection
    useEffect(() => {
        if (!isAuthenticated || !user) {
            router.replace("/auth/login?session_expired=true");
        } else if (user.role?.toUpperCase() === "ADMIN") {
            // ARCHITECTURAL FIX: Redirect Admin to the centralized hub
            router.replace("/admin");
        } else {
            // Both STUDENTS and TEACHERS are permitted here
            setIsCheckingAuth(false);
        }
    }, [isAuthenticated, user, router]);

    if (isCheckingAuth) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-50">
                <div className="w-8 h-8 border-4 border-neutral-300 border-t-neutral-900 rounded-full animate-spin"></div>
            </div>
        );
    }

    const userRole = user?.role?.toUpperCase() || "STUDENT";
    const isTeacher = userRole === "TEACHER";
    const displayName = user?.email?.split('@')[0] || (isTeacher ? "Professor" : "Student");

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                
                <section className="mb-10">
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                        Welcome back, {displayName}
                    </h1>
                    <p className="mt-2 text-neutral-500">
                        {isTeacher 
                            ? "Manage your courses, upload official materials, and monitor academic activity."
                            : "What would you like to focus on today?"}
                    </p>
                </section>

                {/* --- POLYMORPHIC UI: TEACHER DASHBOARD --- */}
                {isTeacher && (
                    // SOTA FIX: Rebalanced grid to 2 columns after removing unauthorized Moderation panel
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Upload Official Course */}
                        <Link href="/upload" className="group relative bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md hover:border-neutral-300 transition-all">
                            <div className="w-12 h-12 bg-neutral-100 text-neutral-900 rounded-xl flex items-center justify-center mb-4 group-hover:bg-black group-hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-neutral-900 mb-2">Upload Course</h3>
                            <p className="text-sm text-neutral-500">
                                Publish official university documents, slides, and syllabus materials to the library.
                            </p>
                        </Link>

                        {/* Search Library */}
                        <Link href="/search" className="group relative bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md hover:border-neutral-300 transition-all">
                            <div className="w-12 h-12 bg-neutral-100 text-neutral-900 rounded-xl flex items-center justify-center mb-4 group-hover:bg-black group-hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-neutral-900 mb-2">Search Library</h3>
                            <p className="text-sm text-neutral-500">
                                Access the global academic repository and view existing course materials.
                            </p>
                        </Link>

                    </div>
                )}

                {/* --- POLYMORPHIC UI: STUDENT DASHBOARD --- */}
                {!isTeacher && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        {/* Search / Library Action */}
                        <Link href="/search" className="group relative bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md hover:border-neutral-300 transition-all">
                            <div className="w-12 h-12 bg-neutral-100 text-neutral-900 rounded-xl flex items-center justify-center mb-4 group-hover:bg-black group-hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-neutral-900 mb-2">Search Library</h3>
                            <p className="text-sm text-neutral-500">
                                Access university documents, past exams, and community summaries.
                            </p>
                        </Link>

                        {/* Contribute / Upload Action */}
                        <Link href="/upload" className="group relative bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md hover:border-neutral-300 transition-all">
                            <div className="w-12 h-12 bg-neutral-100 text-neutral-900 rounded-xl flex items-center justify-center mb-4 group-hover:bg-black group-hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-neutral-900 mb-2">Contribute Notes</h3>
                            <p className="text-sm text-neutral-500">
                                Upload your documents to earn XP and help your fellow students.
                            </p>
                        </Link>

                        {/* Study Tools / Quizzes Action */}
                        <Link href="/document/study-tools" className="group relative bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 hover:shadow-md hover:border-neutral-300 transition-all">
                            <div className="w-12 h-12 bg-neutral-100 text-neutral-900 rounded-xl flex items-center justify-center mb-4 group-hover:bg-black group-hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-neutral-900 mb-2">My Study Tools</h3>
                            <p className="text-sm text-neutral-500">
                                Review your generated flashcards, mind maps, and past quiz history.
                            </p>
                        </Link>

                    </div>
                )}

                {/* Activity Feed Placeholder */}
                <section className="mt-12">
                    <h2 className="text-xl font-bold tracking-tight text-neutral-900 mb-6">
                        {isTeacher ? "System Overview" : "Recent Activity"}
                    </h2>
                    <div className="bg-white rounded-2xl border border-neutral-200 p-8 text-center shadow-sm">
                        <p className="text-sm text-neutral-500">
                            {isTeacher 
                                ? "Platform statistics and recent faculty activities will appear here." 
                                : "Your recent study sessions and contributions will appear here."}
                        </p>
                    </div>
                </section>
                
            </main>
        </div>
    );
}