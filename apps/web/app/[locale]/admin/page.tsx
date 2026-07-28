import { redirect } from "next/navigation";

// The console lives under section routes; land on the ops work queue (1.8) —
// an operator's first question is "what needs me?", not "how is the portfolio?".
// Overview remains its own section: it carries portfolio/health data the queue
// does not cover, so it is re-pointed, not removed.
export default async function AdminIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/admin/ops`);
}
