"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { jobSchema, type AnalysisJob } from "../lib/report-schema";
import { ExampleCards } from "./ExampleCards";
import { Reception } from "./Reception";
import { Arrow } from "./SiteChrome";

const storedJobKey = "wallstreet.current-analysis";
const pendingJobKey = "wallstreet.pending-submission";
type ActiveJob = { id: string; company: string };
const isActive = (job: AnalysisJob) =>
  job.status === "queued" || job.status === "running";
function responseError(body: unknown, fallback: string) {
  return typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
    ? body.error
    : fallback;
}

export function ResearchWorkspace({ connected }: { connected: boolean }) {
  const [company, setCompany] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [active, setActive] = useState<ActiveJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const pending = submitting || Boolean(active && !paused);
  const submitController = useRef<AbortController | null>(null);
  const submission = useRef<{ company: string; key: string } | null>(null);

  useEffect(() => {
    setReady(true);
    try {
      const pending = JSON.parse(localStorage.getItem(pendingJobKey) || "null");
      if (
        pending &&
        typeof pending.company === "string" &&
        /^[a-zA-Z0-9_-]{8,128}$/.test(pending.key)
      ) {
        submission.current = pending;
        setCompany(pending.company);
      }
      const saved = JSON.parse(localStorage.getItem(storedJobKey) || "null");
      if (
        saved &&
        /^[a-zA-Z0-9_-]{8,128}$/.test(saved.id) &&
        typeof saved.company === "string"
      ) {
        setActive(saved);
        setCompany(saved.company);
        setJob({ id: saved.id, status: "queued" });
      }
    } catch {
      /* Storage is optional in private browsing. */
    }
    return () => submitController.current?.abort();
  }, []);

  function remember(value: ActiveJob | null) {
    try {
      if (value) localStorage.setItem(storedJobKey, JSON.stringify(value));
      else localStorage.removeItem(storedJobKey);
    } catch {
      /* Optional persistence. */
    }
  }
  function showResult(next: AnalysisJob) {
    setJob(next);
    if (next.status === "completed") {
      setActive(null);
      // Keep the completed job reference so reopening the site can reload its result.
      setPaused(false);
    } else if (next.status === "failed") {
      setError(
        next.message ||
          "The analysis could not be completed. Please try again.",
      );
      setActive(null);
      remember(null);
      setPaused(false);
    }
  }

  useEffect(() => {
    if (!active || paused) return;
    const controller = new AbortController();
    let disposed = false,
      timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    async function poll() {
      try {
        const response = await fetch(
          `/api/analyses/${encodeURIComponent(active!.id)}`,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20_000),
            ]),
            cache: "no-store",
          },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            responseError(body, "Unable to check this analysis."),
          );
        const next = jobSchema.parse(body);
        if (disposed) return;
        showResult(next);
        if (isActive(next)) {
          if (Date.now() - started > 15 * 60_000) {
            setPaused(true);
            setError(
              "Your analysis is taking longer than expected. You can check again when you are ready.",
            );
          } else timer = setTimeout(poll, 3000);
        }
      } catch (error) {
        if (disposed) return;
        setPaused(true);
        setError(
          error instanceof Error && error.name !== "ZodError"
            ? error.message
            : "The research service returned an unsupported response.",
        );
      }
    }
    timer = setTimeout(poll, 1000);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, paused]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || active) return;
    setError("");
    setJob(null);
    setSubmitting(true);
    const controller = new AbortController();
    submitController.current = controller;
    const submittedCompany = company.trim();
    if (!submission.current || submission.current.company !== submittedCompany)
      submission.current = {
        company: submittedCompany,
        key: crypto.randomUUID(),
      };
    try {
      localStorage.setItem(pendingJobKey, JSON.stringify(submission.current));
    } catch {
      /* Optional persistence. */
    }
    try {
      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Research-Access": accessCode,
          "Idempotency-Key": submission.current.key,
        },
        body: JSON.stringify({ company: submittedCompany }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(20_000),
        ]),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(responseError(body, "Unable to start an analysis."));
      const next = jobSchema.parse(body);
      submission.current = null;
      try {
        localStorage.removeItem(pendingJobKey);
      } catch {
        /* Optional persistence. */
      }
      if (next.status !== "failed")
        remember({ id: next.id, company: submittedCompany });
      showResult(next);
      if (isActive(next)) {
        const saved = { id: next.id, company: company.trim() };
        setActive(saved);
        remember(saved);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error && error.name !== "ZodError"
            ? error.message
            : "The research service returned an unsupported response.",
        );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <main id="main-content">
        <section
          className="research-intro"
          id="research"
          aria-labelledby="research-heading"
        >
          <h1 id="research-heading">
            Good leadership
            <br />
            leaves a record<span className="accent">.</span>
          </h1>
          <p>
            Follow the decisions, promises, and outcomes behind a company.
            <br className="desktop-break" /> Research grounded in evidence, with
            its limits in view.
          </p>
          <form
            onSubmit={submit}
            className="company-search"
            aria-busy={pending}
          >
            <label htmlFor="company">Company name</label>
            <div className="search-controls">
              <input
                id="company"
                name="company"
                placeholder="e.g. Alphabet, Microsoft, NVIDIA"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                minLength={2}
                maxLength={160}
                required
                disabled={!ready || submitting || Boolean(active)}
                autoComplete="organization"
                list="supported-companies"
                aria-describedby="search-note"
              />
              <button
                type="submit"
                disabled={!ready || submitting || Boolean(active)}
              >
                {submitting
                  ? "Starting…"
                  : active
                    ? "Analysis in progress"
                    : "Analyze company"}
                <Arrow />
              </button>
            </div>
            <datalist id="supported-companies">
              {[
                "Apple",
                "Microsoft",
                "Alphabet",
                "Amazon",
                "NVIDIA",
                "Meta",
                "Tesla",
              ].map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {connected && (
              <div className="research-access">
                <label htmlFor="research-access">Research access code</label>
                <div className="access-controls">
                  <input
                    id="research-access"
                    type="password"
                    autoComplete="current-password"
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                    required
                    maxLength={200}
                    disabled={!ready || submitting || Boolean(active)}
                    placeholder="Enter your private access code"
                  />
                  <button
                    className="agent-code-button"
                    type="button"
                    onClick={() => setChatOpen(true)}
                  >
                    Create one with agent
                  </button>
                </div>
              </div>
            )}
            <p id="search-note">
              {connected
                ? "Research checks three fiscal years and continues if you close this tab."
                : "Explore the saved examples below. Live research is temporarily unavailable."}
            </p>
          </form>
          {(submitting || active || job?.status === "completed") && (
            <section className="job-status" role="status" aria-live="polite">
              <span className={`status-dot ${pending ? "working" : ""}`} />
              <div>
                <strong>
                  {submitting
                    ? "Starting your research"
                    : job?.status === "completed"
                      ? `Report ready: ${job.report.company}`
                      : `${paused ? "Research status paused" : job?.status === "queued" ? "Queued for research" : "Researching"}: ${active?.company}`}
                </strong>
                <p>
                  {active
                    ? (job && "message" in job && job.message) ||
                      "Your research continues in the background."
                    : job?.status === "completed"
                      ? "Your report is ready on its own page."
                      : "Submitting your company to the research service."}
                </p>
                {job?.status === "running" && job.progress !== undefined && (
                  <progress
                    aria-label="Analysis progress"
                    max={100}
                    value={job.progress}
                  />
                )}
                {job?.status === "completed" && (
                  <a href={`/research/${job.id}`} className="text-link">
                    Open your report <Arrow />
                  </a>
                )}
              </div>
            </section>
          )}
          {error && (
            <div className="request-error" role="alert">
              <p>{error}</p>
              {active && paused && (
                <div className="status-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setPaused(false);
                    }}
                  >
                    Check again
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActive(null);
                      remember(null);
                      setJob(null);
                      setPaused(false);
                      setError("");
                    }}
                  >
                    Dismiss tracking
                  </button>
                  <span>Dismissing does not cancel the background job.</span>
                </div>
              )}
            </div>
          )}
        </section>
        <ExampleCards />
      </main>
      <Reception
        open={chatOpen}
        onOpenChange={setChatOpen}
        onAccessCode={setAccessCode}
      />
    </>
  );
}
