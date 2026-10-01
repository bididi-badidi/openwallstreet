import { env } from "cloudflare:workers";
import { ResearchWorkspace } from "../components/ResearchWorkspace";

export const dynamic = "force-dynamic";
export default function Home() {
  return (
    <ResearchWorkspace
      connected={Boolean(
        (env.RESEARCH_SERVICE || env.NEBIUS_JOB_SERVICE_URL) &&
        env.NEBIUS_JOB_SERVICE_TOKEN,
      )}
    />
  );
}
