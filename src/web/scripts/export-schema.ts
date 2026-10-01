import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { reportSchema, jobSchema } from "../lib/report-schema";
await writeFile(
  "data/report.schema.json",
  JSON.stringify(z.toJSONSchema(reportSchema), null, 2) + "\n",
);
await writeFile(
  "data/job.schema.json",
  JSON.stringify(z.toJSONSchema(jobSchema), null, 2) + "\n",
);
console.log(
  "Exported report and job JSON Schemas. Runtime validation also checks references, IDs, and chronology.",
);
