import {
  bestByCost,
  bestByEmissions,
  calculateFleet,
  scenarioToOverrides
} from "@/lib/calculations";
import { retrieveDocuments } from "@/lib/rag";
import type {
  AgentResponse,
  AgentStep,
  PortfolioDataset,
  Scenario,
  ScenarioResult
} from "@/lib/types";
import { vehicleDisplayName } from "@/lib/vehicles";

export function runPortfolioAgent(
  data: PortfolioDataset,
  query: string
): AgentResponse {
  const cleanQuery = query.trim() || "Which vehicle is the best balanced choice?";
  const intent = classifyIntent(cleanQuery);
  const scenario = chooseScenario(data, cleanQuery);
  const citations = retrieveDocuments(data, cleanQuery, 4);
  const rows = calculateFleet(
    data.vehicles,
    scenarioToOverrides(scenario),
    scenario.scenario_id
  );
  const recommendation = chooseRecommendation(rows, intent);
  const steps: AgentStep[] = [
    {
      step: 1,
      action: "Classify intent",
      observation: `Detected ${intent} priority from the query.`
    },
    {
      step: 2,
      action: "Select scenario",
      observation: `Using ${scenario.label} (${scenario.annual_miles.toLocaleString("en-GB")} miles/year, ${scenario.ownership_years} years).`
    },
    {
      step: 3,
      action: "Retrieve context",
      observation: `Retrieved ${citations.length} knowledge documents from the local RAG corpus.`
    },
    {
      step: 4,
      action: "Run comparison",
      observation: `Calculated ${rows.length} vehicle outcomes using the same cost and emissions engine as the dashboard.`
    },
    {
      step: 5,
      action: "Select recommendation",
      observation: recommendation
        ? `${vehicleDisplayName(recommendation)} ranked strongest for ${intent}.`
        : "No recommendation could be selected."
    }
  ];

  return {
    query: cleanQuery,
    intent,
    scenario_id: scenario.scenario_id,
    answer: buildAgentAnswer(cleanQuery, scenario, intent, recommendation),
    recommendation: recommendation
      ? {
          vehicle_id: recommendation.vehicle_id,
          vehicle: vehicleDisplayName(recommendation),
          powertrain: recommendation.powertrain,
          reason: recommendationReason(recommendation, intent),
          total_cost_per_mile_gbp: recommendation.total_cost_per_mile_gbp,
          lifecycle_tonnes_co2e: recommendation.lifecycle_tonnes_co2e
        }
      : null,
    steps,
    citations
  };
}

function classifyIntent(query: string): AgentResponse["intent"] {
  const lower = query.toLowerCase();
  if (
    lower.includes("co2") ||
    lower.includes("carbon") ||
    lower.includes("clean") ||
    lower.includes("emission") ||
    lower.includes("green")
  ) {
    return "emissions";
  }
  if (
    lower.includes("cheap") ||
    lower.includes("cost") ||
    lower.includes("save") ||
    lower.includes("budget") ||
    lower.includes("running")
  ) {
    return "cost";
  }
  return "balanced";
}

function chooseScenario(data: PortfolioDataset, query: string): Scenario {
  const lower = query.toLowerCase();
  const direct = data.scenarios.find((scenario) =>
    lower.includes(scenario.label.toLowerCase())
  );
  if (direct) {
    return direct;
  }
  if (lower.includes("fleet") || lower.includes("high mileage") || lower.includes("22000")) {
    return data.scenarios.find((scenario) => scenario.scenario_id === "high_mileage_fleet") ?? data.scenarios[0];
  }
  if (lower.includes("rent") || lower.includes("public charging")) {
    return data.scenarios.find((scenario) => scenario.scenario_id === "public_charging_renter") ?? data.scenarios[0];
  }
  if (lower.includes("city") || lower.includes("commute")) {
    return data.scenarios.find((scenario) => scenario.scenario_id === "city_commuter") ?? data.scenarios[0];
  }
  if (lower.includes("2030") || lower.includes("grid")) {
    return data.scenarios.find((scenario) => scenario.scenario_id === "decarbonised_2030") ?? data.scenarios[0];
  }
  return data.scenarios.find((scenario) => scenario.scenario_id === "mixed_household") ?? data.scenarios[0];
}

function chooseRecommendation(
  rows: ScenarioResult[],
  intent: AgentResponse["intent"]
): ScenarioResult | undefined {
  if (intent === "cost") {
    return bestByCost(rows);
  }
  if (intent === "emissions") {
    return bestByEmissions(rows);
  }

  const minCost = Math.min(...rows.map((row) => row.total_cost_per_mile_gbp));
  const maxCost = Math.max(...rows.map((row) => row.total_cost_per_mile_gbp));
  const minCarbon = Math.min(...rows.map((row) => row.lifecycle_tonnes_co2e));
  const maxCarbon = Math.max(...rows.map((row) => row.lifecycle_tonnes_co2e));

  return [...rows].sort((a, b) => {
    const aScore =
      normalize(a.total_cost_per_mile_gbp, minCost, maxCost) * 0.55 +
      normalize(a.lifecycle_tonnes_co2e, minCarbon, maxCarbon) * 0.45;
    const bScore =
      normalize(b.total_cost_per_mile_gbp, minCost, maxCost) * 0.55 +
      normalize(b.lifecycle_tonnes_co2e, minCarbon, maxCarbon) * 0.45;
    return aScore - bScore;
  })[0];
}

function buildAgentAnswer(
  query: string,
  scenario: Scenario,
  intent: AgentResponse["intent"],
  recommendation?: ScenarioResult
): string {
  if (!recommendation) {
    return `I could not produce a grounded recommendation for "${query}".`;
  }

  return `${vehicleDisplayName(recommendation)} is the strongest ${intent} match under the ${scenario.label} scenario. It comes out at GBP ${recommendation.total_cost_per_mile_gbp} per mile with ${recommendation.lifecycle_tonnes_co2e} tonnes lifecycle CO2e over ${scenario.ownership_years} years.`;
}

function recommendationReason(
  recommendation: ScenarioResult,
  intent: AgentResponse["intent"]
): string {
  if (intent === "emissions") {
    return `Lowest lifecycle CO2e result in the selected scenario at ${recommendation.lifecycle_tonnes_co2e} tonnes.`;
  }
  if (intent === "cost") {
    return `Lowest total cost-per-mile result in the selected scenario at GBP ${recommendation.total_cost_per_mile_gbp}.`;
  }
  return `Best blended result across ownership cost and lifecycle CO2e in the selected scenario.`;
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }
  return (value - min) / (max - min);
}
