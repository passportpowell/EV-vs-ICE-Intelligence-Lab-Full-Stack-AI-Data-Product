import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Owned by passportpowell; review/remove by this UTC deadline. See docs/SECURITY.md.
const advisoryException = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const exceptionExpires = Date.parse("2026-11-12T00:00:00Z");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run through npm run security:audit.");
const result = spawnSync(process.execPath, [npmCli, "audit", "--json"], { encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
if (result.error || ![0, 1].includes(result.status)) throw result.error ?? new Error(`npm audit failed: ${result.stderr}`);
const report = JSON.parse(result.stdout);
if (report.error || !report.vulnerabilities || !report.metadata?.vulnerabilities) throw new Error("Invalid or unavailable npm audit report.");
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const issues = report.vulnerabilities;

function excepted(name, seen = new Set()) {
  const issue = issues[name];
  if (!issue || seen.has(name) || Date.now() >= exceptionExpires || !issue.nodes?.length
    || !issue.nodes.every((node) => lock.packages[node]?.dev === true) || !issue.via?.length) return false;
  const next = new Set([...seen, name]);
  return issue.via.every((via) => typeof via === "string"
    ? excepted(via, next) : via.url === advisoryException);
}

console.log("Unfiltered npm audit:", report.metadata.vulnerabilities);
let blocked = false;
for (const issue of Object.values(issues)) {
  if (!["moderate", "high", "critical"].includes(issue.severity)) continue;
  if (excepted(issue.name)) {
    console.log(`EXCEPTION: ${issue.name}: development-only ${advisoryException}; owner passportpowell; expires 2026-11-12 UTC`);
  } else {
    console.error(`BLOCKING: ${issue.name} (${issue.severity})`);
    blocked = true;
  }
}
process.exitCode = blocked ? 1 : 0;
