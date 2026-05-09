import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader } from "@/components/ui";
import { getQuizForAdmin } from "@/lib/admin-builders/persistence";
import type { Role } from "@/lib/rbac";
import { QuizEditForm } from "./form";

export const dynamic = "force-dynamic";

export default async function AdminQuizEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/training");
  const role = (session.role ?? "guest") as Role;
  if (role !== "admin") redirect("/admin/training");
  const { id } = await params;
  const quizId = Number(id);
  if (!Number.isFinite(quizId)) redirect("/admin/training");
  const quiz = await getQuizForAdmin(quizId);
  if (!quiz) redirect("/admin/training");

  return (
    <PageShell>
      <AppNav role={role} active="admin" />
      <SectionHeader
        title="Sửa quiz 🎯"
        subtitle={quiz.title}
      />
      <QuizEditForm initial={quiz} />
    </PageShell>
  );
}
