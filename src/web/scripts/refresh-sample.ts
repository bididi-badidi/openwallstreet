import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { reportSchema } from "../lib/report-schema";

const sample = JSON.parse(await readFile("../leadership-ui/evidence-model.json", "utf8"));
sample.scope = sample.scope.replaceAll("\u2013", "-");
sample.ledger_url = "/reports/alphabet-ledger.html";
reportSchema.parse(sample);
const ledger = await readFile("../leadership-ui/build/ledger.html", "utf8");
await writeFile("data/alphabet.json", JSON.stringify(sample, null, 2) + "\n");
// Public provenance uses repository-relative paths; original source files stay intact.
await writeFile("public/reports/alphabet-ledger.html", ledger.replaceAll(resolve("../..") + "/", ""));
console.log("Refreshed the validated Alphabet sample and public ledger.");
