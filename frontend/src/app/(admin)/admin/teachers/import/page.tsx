import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Import Teachers",
  description: "Batch import teachers into the ATLAS platform.",
};

export default function AdminTeacherImportPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Teacher Import</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        This route restores the required `/admin/teachers/import` contract path. The CSV preview and upload contract will be wired in the admin data-layer pass.
      </p>
    </div>
  );
}
