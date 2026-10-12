import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ report: {} as unknown, lock: {} as unknown, status: 1 }));
vi.mock("node:child_process", () => ({ spawnSync: () => ({ status: state.status, stdout: JSON.stringify(state.report), stderr: "" }) }));
vi.mock("node:fs", () => ({ readFileSync: () => JSON.stringify(state.lock) }));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
  vi.stubEnv("npm_execpath", "npm-cli.js");
  state.status = 1;
  state.lock = { packages: { "node_modules/braces": { dev: true } } };
  state.report = {
    metadata: { vulnerabilities: { high: 1 } },
    vulnerabilities: { braces: { name: "braces", severity: "high", nodes: ["node_modules/braces"], via: [{ url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" }] } }
  };
});
afterEach(() => { process.exitCode = 0; vi.useRealTimers(); vi.unstubAllEnvs(); });

async function runGate() {
  // The production script is intentionally a standalone npm entry point.
  // @ts-expect-error plain JavaScript entry point has no declaration file
  await import("../../scripts/security-audit.mjs");
  return process.exitCode;
}

it("allows only the owned unexpired development advisory", async () => {
  expect(await runGate()).toBe(0);
});
it("blocks the exception at its deadline", async () => {
  vi.setSystemTime(new Date("2026-11-12T00:00:00Z"));
  expect(await runGate()).toBe(1);
});
it("blocks the same advisory in a runtime node", async () => {
  state.lock = { packages: { "node_modules/braces": {} } };
  expect(await runGate()).toBe(1);
});
it("blocks any additional advisory, even in development dependencies", async () => {
  const report = state.report as { vulnerabilities: { braces: { via: unknown[] } } };
  report.vulnerabilities.braces.via.push({ url: "https://github.com/advisories/GHSA-unexpected" });
  expect(await runGate()).toBe(1);
});
it("fails closed on audit infrastructure errors", async () => {
  state.status = 2;
  await expect(runGate()).rejects.toThrow("npm audit failed");
});
it("fails closed on invalid audit payloads", async () => {
  state.report = { error: { message: "registry unavailable" } };
  await expect(runGate()).rejects.toThrow("Invalid or unavailable");
});
