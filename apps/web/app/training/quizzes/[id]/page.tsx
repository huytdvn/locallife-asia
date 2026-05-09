import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader } from "@/components/ui";
import { getQuizForUser } from "@/lib/admin-builders/persistence";
import type { Role } from "@/lib/rbac";
import { QuizTaker } from "./taker";

export const dynamic = "force-dynamic";

export default async function QuizTakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const quizId = Number(id);
  if (!Number.isFinite(quizId)) redirect("/training/quizzes");
  if (!session?.user?.email) redirect(`/login?next=/training/quizzes/${quizId}`);
  const role = (session.role ?? "guest") as Role;

  const quiz = await getQuizForUser(quizId, role);
  if (!quiz) redirect("/training/quizzes");

  return (
    <PageShell>
      <AppNav role={role} active="training" />
      <SectionHeader title={quiz.title} subtitle={quiz.motto ?? undefined} />
      <QuizTaker
        quiz={{
          id: quiz.id,
          title: quiz.title,
          motto: quiz.motto,
          intro: quiz.intro,
          pass_threshold: quiz.pass_threshold,
          format: quiz.format,
          questions: quiz.questions_public,
        }}
      />
    </PageShell>
  );
}
