"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  BookOpen,
  GraduationCap,
  Save,
  Camera,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth.store";

const FILIERES = [
  "Informatique",
  "Mathematiques",
  "Physique",
  "Chimie",
  "Biologie",
  "Sciences de la Terre",
  "Economie",
  "Droit",
  "Lettres",
  "Langues",
];

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [filiere, setFiliere] = useState(user?.filiere || "");
  const [level, setLevel] = useState(user?.niveau || "");

  const handleSave = () => {
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Personal Information</CardTitle>
                <Button
                  variant={isEditing ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    isEditing ? handleSave() : setIsEditing(true)
                  }
                >
                  {isEditing ? (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </>
                  ) : (
                    "Edit"
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-10 w-10 text-primary" />
                  </div>
                  {isEditing && (
                    <button className="absolute bottom-0 right-0 rounded-full bg-primary p-1.5 text-primary-foreground">
                      <Camera className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div>
                  <p className="font-semibold">
                    {user?.full_name || "Not set"}
                  </p>
                  <p className="text-sm text-muted-foreground">{user?.role}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name</label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!isEditing}
                    type="email"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Filiere</label>
                  <Select
                    value={filiere}
                    onChange={(e) => setFiliere(e.target.value)}
                    disabled={!isEditing}
                  >
                    <option value="">Select filiere</option>
                    {FILIERES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Level</label>
                  <Select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    disabled={!isEditing}
                  >
                    <option value="">Select level</option>
                    <option value="L1">Licence 1</option>
                    <option value="L2">Licence 2</option>
                    <option value="L3">Licence 3</option>
                    <option value="M1">Master 1</option>
                    <option value="M2">Master 2</option>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-muted-foreground">Account ID</span>
                <span className="font-mono text-sm">
                  {user?.id?.slice(0, 8)}...
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-muted-foreground">Role</span>
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-sm">
                  {user?.role}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-muted-foreground">Verified</span>
                <span
                  className={
                    user?.is_verified ? "text-success" : "text-destructive"
                  }
                >
                  {user?.is_verified ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">Member since</span>
                <span>
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString()
                    : "-"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" />
                  Contributions
                </span>
                <span className="font-semibold">12</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Flashcards
                </span>
                <span className="font-semibold">145</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Quizzes
                </span>
                <span className="font-semibold">28</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full" asChild>
                <a href="/auth/forgot-password">Change Password</a>
              </Button>
              <Button variant="destructive" className="w-full">
                Delete Account
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
