"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Eye, EyeOff, GraduationCap, Loader2, X, ChevronDown, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authApi, api } from "@/lib/api";
import type { StudentLevel } from "@/types/api.types";

const PASSWORD_REQUIREMENTS = [
  { id: "length", label: "At least 8 characters", test: (password: string) => password.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (password: string) => /[A-Z]/.test(password) },
  { id: "lower", label: "One lowercase letter", test: (password: string) => /[a-z]/.test(password) },
  { id: "number", label: "One number", test: (password: string) => /\d/.test(password) },
];

export function RegisterPageClient() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  // Refs for outside click handling
  const universityDropdownRef = useRef<HTMLDivElement>(null);
  const departmentDropdownRef = useRef<HTMLDivElement>(null);
  const majorDropdownRef = useRef<HTMLDivElement>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  // University
  const [isUniversityDropdownOpen, setIsUniversityDropdownOpen] = useState(false);
  const [universitySearch, setUniversitySearch] = useState("");
  const [establishmentId, setEstablishmentId] = useState("");

  // Department
  const [isDepartmentDropdownOpen, setIsDepartmentDropdownOpen] = useState(false);
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [filiere, setFiliere] = useState("");

  // Major
  const [isMajorDropdownOpen, setIsMajorDropdownOpen] = useState(false);
  const [majorSearch, setMajorSearch] = useState("");
  const [majorId, setMajorId] = useState("");

  // Level – auto-set from major
  const [level, setLevel] = useState<StudentLevel | "">("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (universityDropdownRef.current && !universityDropdownRef.current.contains(e.target as Node)) {
        setIsUniversityDropdownOpen(false);
      }
      if (departmentDropdownRef.current && !departmentDropdownRef.current.contains(e.target as Node)) {
        setIsDepartmentDropdownOpen(false);
      }
      if (majorDropdownRef.current && !majorDropdownRef.current.contains(e.target as Node)) {
        setIsMajorDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const registrationOptionsQuery = useQuery({
    queryKey: ["auth", "registration-options"],
    queryFn: () => authApi.getRegistrationOptions(),
    staleTime: 5 * 60 * 1000,
  });

  const universities = registrationOptionsQuery.data?.universities ?? [];
  const allDepartments = registrationOptionsQuery.data?.departments ?? [];

  // Filtered universities
  const filteredUniversities = useMemo(() => {
    if (!universitySearch) return universities;
    const lowerSearch = universitySearch.toLowerCase();
    return universities.filter((u) => u.name.toLowerCase().includes(lowerSearch));
  }, [universities, universitySearch]);

  const selectedUniversityName = useMemo(
    () => universities.find((u) => u.id === establishmentId)?.name || "",
    [universities, establishmentId]
  );

  // Departments available for selected university
  const availableDepartments = useMemo(() => {
    if (!establishmentId) return [];
    return allDepartments.filter((dept) => dept.establishment_id === establishmentId);
  }, [allDepartments, establishmentId]);

  // Filtered departments (searchable)
  const filteredDepartments = useMemo(() => {
    if (!departmentSearch) return availableDepartments;
    const lowerSearch = departmentSearch.toLowerCase();
    return availableDepartments.filter((d) => d.name.toLowerCase().includes(lowerSearch));
  }, [availableDepartments, departmentSearch]);

  const selectedDepartmentName = filiere || "";

  // All majors for the selected department
  const { data: majorsData } = useQuery({
    queryKey: ["auth", "majors", establishmentId ? allDepartments.find((d) => d.name === filiere)?.id : null],
    queryFn: async () => {
      const dept = allDepartments.find((d) => d.name === filiere);
      if (!dept) return [];
      return await api.get<{ id: string; name: string; department_id: string; level: string }[]>(
        `/auth/majors/${dept.id}`
      );
    },
    enabled: Boolean(filiere),
    staleTime: 2 * 60 * 1000,
  });

  const availableMajors = majorsData ?? [];

  // Filtered majors (searchable)
  const filteredMajors = useMemo(() => {
    if (!majorSearch) return availableMajors;
    const lowerSearch = majorSearch.toLowerCase();
    return availableMajors.filter((m) => m.name.toLowerCase().includes(lowerSearch));
  }, [availableMajors, majorSearch]);

  const selectedMajorName = useMemo(
    () => availableMajors.find((m) => m.id === majorId)?.name || "",
    [availableMajors, majorId]
  );

  const passwordsMatch = password === confirmPassword && confirmPassword !== "";
  const passwordStrong = PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password));

  // Handlers
  const selectUniversity = (id: string, name: string) => {
    setEstablishmentId(id);
    setUniversitySearch("");
    setIsUniversityDropdownOpen(false);
    setFiliere("");
    setMajorId("");
    setLevel("");
  };

  const selectDepartment = (name: string) => {
    setFiliere(name);
    setDepartmentSearch("");
    setIsDepartmentDropdownOpen(false);
    setMajorId("");
    setLevel("");
  };

  const selectMajor = (id: string, majorLevel: string) => {
    setMajorId(id);
    setMajorSearch("");
    setIsMajorDropdownOpen(false);
    setLevel(majorLevel as StudentLevel);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Please enter your full name");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    if (!establishmentId) {
      setError("Please select a valid University from the list");
      return;
    }
    if (!filiere) {
      setError("Please select your department");
      return;
    }
    if (!majorId) {
      setError("Please select your major");
      return;
    }
    if (!level) {
      setError("Level could not be determined from the selected major");
      return;
    }
    if (!passwordStrong) {
      setError("Password does not meet all requirements");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      await authApi.register({
        email,
        password,
        full_name: fullName,
        role: "STUDENT",
        filiere,
        level: level as StudentLevel,
        establishment_id: establishmentId,
        major_id: majorId,
      });
      router.push(`/auth/activate/student?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isMounted) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <GraduationCap className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Create Student Account</CardTitle>
            <CardDescription>Join ATLAS as a student and unlock your learning workspace</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            ) : null}

            <Input
              type="text"
              label="Full Name"
              placeholder="Ahmed Ben Ali"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />

            <Input
              type="email"
              label="Email"
              placeholder="you@university.tn"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />

            {/* ── University (searchable) ── */}
            <div className="space-y-2 relative z-50" ref={universityDropdownRef}>
              <label className="text-sm font-medium">
                University <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <div
                  className="flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setIsUniversityDropdownOpen(!isUniversityDropdownOpen)}
                >
                  <span className={selectedUniversityName ? "text-foreground" : "text-muted-foreground"}>
                    {selectedUniversityName || "Select a university..."}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </div>
                {isUniversityDropdownOpen && (
                  <div className="absolute top-full left-0 z-[100] mt-1 w-full overflow-hidden rounded-md border border-input bg-background shadow-md">
                    <div className="flex items-center border-b border-input px-3 bg-background">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <input
                        className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                        placeholder="Search universities..."
                        value={universitySearch}
                        onChange={(e) => setUniversitySearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="max-h-[200px] overflow-y-auto p-1 bg-background">
                      {filteredUniversities.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">No university found.</div>
                      ) : (
                        filteredUniversities.map((uni) => (
                          <div
                            key={uni.id}
                            className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${
                              establishmentId === uni.id ? "bg-accent/50 font-medium" : ""
                            }`}
                            onClick={() => selectUniversity(uni.id, uni.name)}
                          >
                            {establishmentId === uni.id && (
                              <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                <Check className="h-4 w-4" />
                              </span>
                            )}
                            {uni.name}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Department (searchable) ── */}
            <div className="space-y-2 relative z-40" ref={departmentDropdownRef}>
              <label className="text-sm font-medium">
                Department <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <div
                  className="flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setIsDepartmentDropdownOpen(!isDepartmentDropdownOpen)}
                >
                  <span className={selectedDepartmentName ? "text-foreground" : "text-muted-foreground"}>
                    {selectedDepartmentName || "Select a department..."}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </div>
                {isDepartmentDropdownOpen && (
                  <div className="absolute top-full left-0 z-[100] mt-1 w-full overflow-hidden rounded-md border border-input bg-background shadow-md">
                    <div className="flex items-center border-b border-input px-3 bg-background">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <input
                        className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                        placeholder="Search departments..."
                        value={departmentSearch}
                        onChange={(e) => setDepartmentSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="max-h-[200px] overflow-y-auto p-1 bg-background">
                      {!establishmentId ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">Select a university first.</div>
                      ) : filteredDepartments.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">No department found.</div>
                      ) : (
                        filteredDepartments.map((dept) => (
                          <div
                            key={dept.id}
                            className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${
                              filiere === dept.name ? "bg-accent/50 font-medium" : ""
                            }`}
                            onClick={() => selectDepartment(dept.name)}
                          >
                            {filiere === dept.name && (
                              <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                <Check className="h-4 w-4" />
                              </span>
                            )}
                            {dept.name}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Major (searchable) ── */}
            <div className="space-y-2 relative z-30" ref={majorDropdownRef}>
              <label className="text-sm font-medium">
                Major <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <div
                  className="flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setIsMajorDropdownOpen(!isMajorDropdownOpen)}
                >
                  <span className={selectedMajorName ? "text-foreground" : "text-muted-foreground"}>
                    {selectedMajorName || "Select your major..."}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </div>
                {isMajorDropdownOpen && (
                  <div className="absolute top-full left-0 z-[100] mt-1 w-full overflow-hidden rounded-md border border-input bg-background shadow-md">
                    <div className="flex items-center border-b border-input px-3 bg-background">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <input
                        className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                        placeholder="Search majors..."
                        value={majorSearch}
                        onChange={(e) => setMajorSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="max-h-[200px] overflow-y-auto p-1 bg-background">
                      {!filiere ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">Select a department first.</div>
                      ) : filteredMajors.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">No major found.</div>
                      ) : (
                        filteredMajors.map((major) => (
                          <div
                            key={major.id}
                            className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${
                              majorId === major.id ? "bg-accent/50 font-medium" : ""
                            }`}
                            onClick={() => selectMajor(major.id, major.level)}
                          >
                            {majorId === major.id && (
                              <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                <Check className="h-4 w-4" />
                              </span>
                            )}
                            {major.name} ({major.level})
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Level (auto‑filled, read‑only) ── */}
            <div className="space-y-2 relative z-20">
              <label htmlFor="level" className="text-sm font-medium">
                Level <span className="text-destructive">*</span>
              </label>
              <Select id="level" name="level" value={level} onChange={() => {}} required disabled>
                <option value="">
                  {!majorId ? "Select a major first" : level || "Level not determined"}
                </option>
              </Select>
            </div>

            {/* ── Password ── */}
            <div className="space-y-2 relative z-10">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="new-password"
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground z-10"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="space-y-1 rounded-lg bg-muted/50 p-3">
                {PASSWORD_REQUIREMENTS.map((requirement) => (
                  <div
                    key={requirement.id}
                    className={`flex items-center gap-2 text-xs ${
                      requirement.test(password) ? "text-success" : "text-muted-foreground"
                    }`}
                  >
                    {requirement.test(password) ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {requirement.label}
                  </div>
                ))}
              </div>
            </div>

            <Input
              type="password"
              label="Confirm Password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              autoComplete="new-password"
            />

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link href="/auth/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}