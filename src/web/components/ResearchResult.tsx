"use client";
import { useEffect, useState } from "react";
import { jobSchema, type AnalysisJob } from "../lib/report-schema";
import { LeadershipReport } from "./report/LeadershipReport";
import { Arrow } from "./SiteChrome";
export function ResearchResult({ id }: { id: string }) {
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const started = Date.now();
    async function load() {
      try {
        const response = await fetch(`/api/analyses/${id}`, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20000),
          ]),
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data &&
              typeof data === "object" &&
              "error" in data &&
              typeof data.error === "string"
              ? data.error
              : "Unable to load this report.",
          );
        const next = jobSchema.parse(data);
        if (disposed) return;
        setJob(next);
        if (next.status === "queued" || next.status === "running") {
          if (Date.now() - started > 15 * 60_000)
            setError(
              "Research is still running. Check again when you are ready.",
            );
          else timer = setTimeout(load, 3000);
        }
      } catch (e) {
        if (!disposed)
          setError(
            e instanceof Error && e.name !== "ZodError"
              ? e.message
              : "Unable to read this report.",
          );
      }
    }
    setError("");
    load();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, retry]);
  return (
    <main id="main-content" className="example-page">
      <a className="back-link" href="/">
        <Arrow back /> Home
      </a>
      <div className="example-page-heading">
        <h1>
          {job?.status === "completed" ? job.report.company : "Your research"}
        </h1>
        {job?.status === "completed" && (
          <a className="text-link" href={`/api/analyses/${id}/evidence`}>
            Download source evidence <Arrow />
          </a>
        )}
      </div>
      {error && (
        <div role="alert" className="request-error">
          <p>{error}</p>
          <button onClick={() => setRetry((v) => v + 1)}>Check again</button>
        </div>
      )}
      {job?.status === "completed" ? (
        <LeadershipReport report={job.report} />
      ) : (
        <p role="status">
          {job?.status === "failed"
            ? job.message
            : job && "message" in job
              ? job.message
              : "Loading your research..."}
        </p>
      )}
    </main>
  );
}
