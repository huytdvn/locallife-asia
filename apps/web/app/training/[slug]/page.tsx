import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TrainingViewer } from "@/components/training-viewer";
import { AppNav } from "@/components/app-nav";
import { PageShell } from "@/components/ui";
import type { Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function TrainingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  const { slug } = await params;
  if (!session?.user?.email) {
    redirect(`/login?next=/training/${encodeURIComponent(slug)}`);
  }
  const role = (session.role ?? "guest") as Role;

  return (
    <PageShell maxWidth={960}>
      <AppNav role={role} active="training" />
      <TrainingViewer slug={slug} />
    </PageShell>
  );
}
