export type FuelType = "electric" | "petrol" | "diesel";

export type Vehicle = {
  id: string;
  make: string;
  model: string;
  trim: string;
  model_year: number;
  available_from_year: number;
  available_to_year: number;
  uk_market_status: "current" | "used";
  body_style: string;
  segment: string;
  powertrain: string;
  fuel_type: FuelType;
  purchase_price_gbp: number;
  efficiency_value: number;
  efficiency_unit: "kwh_per_100km" | "litres_per_100km";
  battery_kwh: number;
  tailpipe_gco2_per_km: number;
  manufacturing_gco2e_kg: number;
  annual_maintenance_gbp: number;
  insurance_group: number;
  depreciation_3yr_pct: number;
  source_note: string;
};

export type Scenario = {
  scenario_id: string;
  label: string;
  annual_miles: number;
  ownership_years: number;
  urban_share_pct: number;
  motorway_share_pct: number;
  grid_year: number;
  price_scenario_id: string;
  grid_gco2e_per_kwh: number;
  petrol_gbp_per_litre: number;
  diesel_gbp_per_litre: number;
  home_electricity_gbp_per_kwh: number;
  public_rapid_gbp_per_kwh: number;
  weighted_electricity_gbp_per_kwh: number;
  home_charging_share_pct: number;
};

export type ScenarioResult = {
  scenario_id: string;
  vehicle_id: string;
  make: string;
  model: string;
  trim: string;
  model_year: number;
  available_from_year: number;
  available_to_year: number;
  uk_market_status: string;
  body_style: string;
  segment: string;
  powertrain: string;
  fuel_type: FuelType;
  annual_miles: number;
  ownership_years: number;
  adjusted_efficiency: number;
  efficiency_unit: string;
  energy_unit: string;
  energy_units_used: number;
  energy_cost_gbp: number;
  maintenance_cost_gbp: number;
  depreciation_cost_gbp: number;
  total_cost_gbp: number;
  total_cost_per_mile_gbp: number;
  annual_energy_cost_gbp: number;
  use_phase_kgco2e: number;
  manufacturing_kgco2e: number;
  lifecycle_kgco2e: number;
  lifecycle_tonnes_co2e: number;
  break_even_miles_vs_segment_ice?: number | null;
};

export type PowertrainSummary = {
  scenario_id: string;
  powertrain: string;
  vehicles: number;
  avg_total_cost_per_mile_gbp: number;
  avg_total_cost_gbp: number;
  avg_lifecycle_tonnes_co2e: number;
  avg_annual_energy_cost_gbp: number;
  avg_use_phase_kgco2e: number;
};

export type SignalFeature = {
  cycle: string;
  samples: number;
  avg_speed_kph: number;
  max_speed_kph: number;
  stop_share_pct: number;
  peak_acceleration_mps2: number;
  peak_deceleration_mps2: number;
  jerk_rms: number;
  energy_stress_score: number;
};

export type ModelReport = {
  target: string;
  training_rows: number;
  test_rows: number;
  r2: number;
  mae_gbp_per_mile: number;
  feature_importance: Array<{ feature: string; importance: number }>;
  sample_predictions: Array<Record<string, string | number>>;
};

export type RagDocument = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  content: string;
  source: string;
  metadata: Record<string, string | number>;
};

export type RagHit = RagDocument & {
  score: number;
  matched_terms: string[];
};

export type SourceRegistryEntry = {
  source_id: string;
  source_name: string;
  source_type: string;
  refresh_mode: string;
  fields: string;
  conflict_policy: string;
};

export type AgentStep = {
  step: number;
  action: string;
  observation: string;
};

export type AgentRecommendation = {
  vehicle_id: string;
  vehicle: string;
  powertrain: string;
  reason: string;
  total_cost_per_mile_gbp: number;
  lifecycle_tonnes_co2e: number;
};

export type AgentResponse = {
  query: string;
  intent: "cost" | "emissions" | "balanced";
  scenario_id: string;
  answer: string;
  recommendation: AgentRecommendation | null;
  steps: AgentStep[];
  citations: RagHit[];
};

export type PortfolioDataset = {
  generated_at: string;
  project: {
    name: string;
    slug: string;
    repository: string;
  };
  assumptions: Record<string, string | number>;
  vehicles: Vehicle[];
  scenarios: Scenario[];
  scenario_results: ScenarioResult[];
  powertrain_summary: PowertrainSummary[];
  signal_processing: SignalFeature[];
  rag_corpus: RagDocument[];
  source_registry: SourceRegistryEntry[];
  model: ModelReport;
  api_examples: string[];
};

export type ScenarioOverrides = {
  annualMiles: number;
  ownershipYears: number;
  urbanSharePct: number;
  motorwaySharePct: number;
  petrolGbpPerLitre: number;
  dieselGbpPerLitre: number;
  homeElectricityGbpPerKwh: number;
  publicRapidGbpPerKwh: number;
  homeChargingSharePct: number;
  gridGco2ePerKwh: number;
};
