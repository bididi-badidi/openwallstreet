import { notFound } from "next/navigation";
import alphabet from "../../../data/alphabet.json";
import microsoft from "../../../data/microsoft.json";
import { examples } from "../../../lib/examples";
import { reportSchema } from "../../../lib/report-schema";
import { LeadershipReport } from "../../../components/report/LeadershipReport";
import { Arrow } from "../../../components/SiteChrome";
export default async function ExamplePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const example = examples.find((e) => e.slug === slug);
  if (!example) notFound();
  const report = reportSchema.parse(slug === "alphabet" ? alphabet : microsoft);
  return (
    <main id="main-content" className="example-page">
      <a className="back-link" href="/#examples">
        <Arrow back /> All examples
      </a>
      <div className="example-page-heading">
        <div>
          <p>Saved example · {example.years}</p>
          <h1>{example.company}</h1>
        </div>
        {slug === "microsoft" ? (
          <a
            className="text-link"
            href="/reports/microsoft-evidence.json"
            download
          >
            Download source evidence <Arrow />
          </a>
        ) : (
          <a className="text-link" href="/#research">
            Research a company <Arrow />
          </a>
        )}
      </div>
      <LeadershipReport report={report} sample />
    </main>
  );
}
