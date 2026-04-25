import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `${username} Profile`,
    description: `Public profile page for ${username} on ATLAS.`,
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-blue-700">Public Profile</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{username}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This page restores the public `/profile/[username]` contract path. It will be wired to live profile data in the next frontend data-layer pass.
        </p>
      </div>
    </main>
  );
}
