import { notFound } from "next/navigation";
import { jobIdSchema } from "../../../lib/report-schema";
import { ResearchResult } from "../../../components/ResearchResult";
export default async function ResearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!jobIdSchema.safeParse(id).success) notFound();
  return <ResearchResult id={id} />;
}
