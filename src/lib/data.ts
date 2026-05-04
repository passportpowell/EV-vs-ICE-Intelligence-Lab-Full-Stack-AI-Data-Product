import datasetJson from "@/data/portfolio-dataset.json";
import { calculateFleet, scenarioToOverrides } from "@/lib/calculations";
import type {
  PortfolioDataset,
  Scenario,
  ScenarioOverrides,
  ScenarioResult
} from "@/lib/types";

export const dataset = datasetJson as unknown as PortfolioDataset;

export function getScenario(scenarioId?: string): Scenario {
  return (
    dataset.scenarios.find((scenario) => scenario.scenario_id === scenarioId) ??
    dataset.scenarios[1] ??
    dataset.scenarios[0]
  );
}

export function getScenarioResults(scenarioId?: string): ScenarioResult[] {
  const scenario = getScenario(scenarioId);
  return dataset.scenario_results.filter(
    (result) => result.scenario_id === scenario.scenario_id
  );
}

export function buildComparison(
  scenarioId?: string,
  overrides?: Partial<ScenarioOverrides>
): ScenarioResult[] {
  const scenario = getScenario(scenarioId);
  return calculateFleet(dataset.vehicles, {
    ...scenarioToOverrides(scenario),
    ...overrides
  }, scenario.scenario_id);
}
