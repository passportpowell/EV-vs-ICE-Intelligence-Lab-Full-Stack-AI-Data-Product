"use client";

import {
  BatteryCharging,
  Bot,
  BrainCircuit,
  Car,
  Database,
  Fuel,
  Gauge,
  GitBranch,
  ListChecks,
  PlugZap,
  Search,
  Workflow
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  bestByCost,
  bestByEmissions,
  calculateFleet,
  scenarioToOverrides,
  summariseByPowertrain,
  weightedElectricityPrice
} from "@/lib/calculations";
import { runPortfolioAgent } from "@/lib/agent";
import type { CatalogMatch, ProvenanceReport } from "@/lib/dvla";
import {
  blendedHomeTariffGbpPerKwh,
  buildEnergyComparisonRows,
  tariffDisplayName,
  tariffRateInputFromTariff
} from "@/lib/tariffs";
import {
  uniqueSorted,
  vehicleCatalogLabel,
  vehicleDisplayName
} from "@/lib/vehicles";
import type {
  PortfolioDataset,
  Scenario,
  ScenarioOverrides,
  ScenarioResult,
  FuelPriceSnapshot,
  TariffRateInput,
  Vehicle
} from "@/lib/types";

const POWERTRAIN_COLORS: Record<string, string> = {
  EV: "#0f766e",
  Petrol: "#b45309",
  Diesel: "#475569",
  "Petrol Hybrid": "#2563eb"
};

type DashboardProps = {
  data: PortfolioDataset;
};

export function Dashboard({ data }: DashboardProps) {
  const defaultScenario =
    data.scenarios.find((scenario) => scenario.scenario_id === "mixed_household") ??
    data.scenarios[0];
  const defaultTariff =
    data.ev_tariffs.find((tariff) => tariff.tariff_id === "intelligent-octopus-go") ??
    data.ev_tariffs[0];
  const defaultTariffInput: TariffRateInput = defaultTariff
    ? tariffRateInputFromTariff(defaultTariff)
    : {
        offPeakPPerKwh: 8,
        peakPPerKwh: 33.5,
        offPeakSharePct: 90,
        standingChargePPerDay: 57.21,
        standingChargeAllocationPct: 100
      };
  const [scenario, setScenario] = useState<Scenario>(defaultScenario);
  const [segment, setSegment] = useState("all");
  const [annualMiles, setAnnualMiles] = useState(defaultScenario.annual_miles);
  const [ownershipYears, setOwnershipYears] = useState(defaultScenario.ownership_years);
  const [homeShare, setHomeShare] = useState(
    defaultScenario.home_charging_share_pct
  );
  const [selectedTariffId, setSelectedTariffId] = useState(
    defaultTariff?.tariff_id ?? "custom"
  );
  const [offPeakRateP, setOffPeakRateP] = useState(
    defaultTariffInput.offPeakPPerKwh
  );
  const [peakRateP, setPeakRateP] = useState(defaultTariffInput.peakPPerKwh);
  const [offPeakShare, setOffPeakShare] = useState(
    defaultTariffInput.offPeakSharePct
  );
  const [standingChargeP, setStandingChargeP] = useState(
    defaultTariffInput.standingChargePPerDay
  );
  const [standingAllocation, setStandingAllocation] = useState(
    defaultTariffInput.standingChargeAllocationPct
  );
  const [petrolPrice, setPetrolPrice] = useState(defaultScenario.petrol_gbp_per_litre);
  const [dieselPrice, setDieselPrice] = useState(defaultScenario.diesel_gbp_per_litre);
  const [fuelSnapshot, setFuelSnapshot] = useState<FuelPriceSnapshot | null>(null);
  const [agentDraft, setAgentDraft] = useState(
    "I drive 22000 miles a year and want low running costs"
  );
  const [agentQuestion, setAgentQuestion] = useState(agentDraft);
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    data.vehicles[0]?.id ?? ""
  );
  const [registration, setRegistration] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const [provenanceReport, setProvenanceReport] =
    useState<ProvenanceReport | null>(null);
  const [matchResults, setMatchResults] = useState<CatalogMatch[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogMakeFilter, setCatalogMakeFilter] = useState("all");
  const [catalogModelFilter, setCatalogModelFilter] = useState("all");
  const [catalogYearFilter, setCatalogYearFilter] = useState("all");
  const [catalogPowertrainFilter, setCatalogPowertrainFilter] = useState("all");

  const selectedTariff = useMemo(
    () => data.ev_tariffs.find((tariff) => tariff.tariff_id === selectedTariffId),
    [data.ev_tariffs, selectedTariffId]
  );
  const tariffInput: TariffRateInput = useMemo(
    () => ({
      offPeakPPerKwh: offPeakRateP,
      peakPPerKwh: peakRateP,
      offPeakSharePct: offPeakShare,
      standingChargePPerDay: standingChargeP,
      standingChargeAllocationPct: standingAllocation
    }),
    [offPeakRateP, offPeakShare, peakRateP, standingAllocation, standingChargeP]
  );
  const effectiveHomeElectricity = useMemo(
    () => blendedHomeTariffGbpPerKwh(tariffInput),
    [tariffInput]
  );

  const overrides: ScenarioOverrides = useMemo(
    () => ({
      ...scenarioToOverrides(scenario),
      annualMiles,
      ownershipYears,
      homeChargingSharePct: homeShare,
      homeElectricityGbpPerKwh: effectiveHomeElectricity,
      petrolGbpPerLitre: petrolPrice,
      dieselGbpPerLitre: dieselPrice,
      evStandingChargeGbpPerDay: standingChargeP / 100,
      standingChargeAllocationPct: standingAllocation
    }),
    [
      annualMiles,
      dieselPrice,
      effectiveHomeElectricity,
      homeShare,
      ownershipYears,
      petrolPrice,
      scenario,
      standingAllocation,
      standingChargeP
    ]
  );

  useEffect(() => {
    let active = true;
    fetch("/api/prices/fuel", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: FuelPriceSnapshot) => {
        if (!active) {
          return;
        }
        setFuelSnapshot(payload);
        if (
          Number.isFinite(payload.petrol_gbp_per_litre) &&
          Number.isFinite(payload.diesel_gbp_per_litre)
        ) {
          setPetrolPrice(payload.petrol_gbp_per_litre);
          setDieselPrice(payload.diesel_gbp_per_litre);
        }
      })
      .catch(() => {
        if (active) {
          setFuelSnapshot(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const allRows = useMemo(
    () => calculateFleet(data.vehicles, overrides, scenario.scenario_id),
    [data.vehicles, overrides, scenario.scenario_id]
  );

  const rows = useMemo(
    () =>
      allRows
        .filter((row) => (segment === "all" ? true : row.segment === segment))
        .sort((a, b) => a.total_cost_per_mile_gbp - b.total_cost_per_mile_gbp),
    [allRows, segment]
  );

  const summary = useMemo(() => summariseByPowertrain(rows), [rows]);
  const cheapest = bestByCost(rows);
  const cleanest = bestByEmissions(rows);
  const segments = useMemo(
    () => ["all", ...Array.from(new Set(data.vehicles.map((vehicle) => vehicle.segment)))],
    [data.vehicles]
  );
  const selectedApiUrl = `/api/comparisons?scenario=${scenario.scenario_id}&annualMiles=${annualMiles}&ownershipYears=${ownershipYears}`;
  const agentResult = useMemo(
    () => runPortfolioAgent(data, agentQuestion),
    [agentQuestion, data]
  );
  const selectedCatalogVehicle = (
    data.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ??
    data.vehicles[0]
  ) as Vehicle;
  const catalogMakes = useMemo(
    () => uniqueSorted(data.vehicles.map((vehicle) => vehicle.make)),
    [data.vehicles]
  );
  const catalogModels = useMemo(
    () =>
      uniqueSorted(
        data.vehicles
          .filter((vehicle) =>
            catalogMakeFilter === "all" ? true : vehicle.make === catalogMakeFilter
          )
          .map((vehicle) => vehicle.model)
      ),
    [catalogMakeFilter, data.vehicles]
  );
  const catalogYears = useMemo(
    () => {
      const minYear = Math.min(
        ...data.vehicles.map((vehicle) => vehicle.available_from_year)
      );
      const maxYear = Math.max(
        ...data.vehicles.map((vehicle) => vehicle.available_to_year)
      );
      return Array.from({ length: maxYear - minYear + 1 }, (_, index) =>
        String(maxYear - index)
      );
    },
    [data.vehicles]
  );
  const catalogPowertrains = useMemo(
    () => uniqueSorted(data.vehicles.map((vehicle) => vehicle.powertrain)),
    [data.vehicles]
  );
  const filteredCatalogVehicles = useMemo(
    () =>
      data.vehicles
        .filter(
          (vehicle) => catalogMakeFilter === "all" || vehicle.make === catalogMakeFilter
        )
        .filter(
          (vehicle) =>
            catalogModelFilter === "all" || vehicle.model === catalogModelFilter
        )
        .filter(
          (vehicle) =>
            catalogYearFilter === "all" ||
            (vehicle.available_from_year <= Number(catalogYearFilter) &&
              vehicle.available_to_year >= Number(catalogYearFilter))
        )
        .filter(
          (vehicle) =>
            catalogPowertrainFilter === "all" ||
            vehicle.powertrain === catalogPowertrainFilter
        )
        .filter((vehicle) => {
          if (!catalogQuery.trim()) {
            return true;
          }
          return [
            vehicle.make,
            vehicle.model,
            vehicle.trim,
            vehicle.model_year,
            vehicle.powertrain,
            vehicle.fuel_type,
            vehicle.segment,
            vehicle.body_style
          ]
            .join(" ")
            .toLowerCase()
            .includes(catalogQuery.toLowerCase().trim());
        })
        .sort(
          (a, b) =>
            b.model_year - a.model_year ||
            a.make.localeCompare(b.make) ||
            a.model.localeCompare(b.model) ||
            a.trim.localeCompare(b.trim)
        ),
    [
      catalogMakeFilter,
      catalogModelFilter,
      catalogPowertrainFilter,
      catalogQuery,
      catalogYearFilter,
      data.vehicles
    ]
  );
  const catalogCoverage = useMemo(() => {
    const availabilityStarts = data.vehicles.map(
      (vehicle) => vehicle.available_from_year
    );
    const availabilityEnds = data.vehicles.map(
      (vehicle) => vehicle.available_to_year
    );
    return {
      minAvailabilityYear: Math.min(...availabilityStarts),
      maxAvailabilityYear: Math.max(...availabilityEnds),
      makes: catalogMakes.length,
      models: uniqueSorted(data.vehicles.map((vehicle) => vehicle.model)).length,
      trims: data.vehicles.length
    };
  }, [catalogMakes.length, data.vehicles]);
  const catalogTrimsForSelectedModel = useMemo(
    () =>
      data.vehicles
        .filter(
          (vehicle) =>
            vehicle.make === selectedCatalogVehicle.make &&
            vehicle.model === selectedCatalogVehicle.model
        )
        .sort((a, b) => a.trim.localeCompare(b.trim)),
    [data.vehicles, selectedCatalogVehicle.make, selectedCatalogVehicle.model]
  );
  const selectedCatalogRow = allRows.find(
    (row) => row.vehicle_id === selectedCatalogVehicle.id
  );
  const tariffComparisonRows = useMemo(
    () =>
      buildEnergyComparisonRows(
        data.vehicles,
        selectedCatalogVehicle,
        overrides,
        tariffInput
      ),
    [data.vehicles, overrides, selectedCatalogVehicle, tariffInput]
  );
  const tariffSourceLabel = selectedTariff
    ? `${selectedTariff.source_name}, ${formatDateLabel(selectedTariff.source_date)}`
    : "User input";

  function applyScenario(nextScenarioId: string) {
    const nextScenario =
      data.scenarios.find((item) => item.scenario_id === nextScenarioId) ??
      defaultScenario;
    setScenario(nextScenario);
    setAnnualMiles(nextScenario.annual_miles);
    setOwnershipYears(nextScenario.ownership_years);
    setHomeShare(nextScenario.home_charging_share_pct);
    setPetrolPrice(nextScenario.petrol_gbp_per_litre);
    setDieselPrice(nextScenario.diesel_gbp_per_litre);
  }

  function applyTariff(nextTariffId: string) {
    setSelectedTariffId(nextTariffId);
    const nextTariff = data.ev_tariffs.find(
      (tariff) => tariff.tariff_id === nextTariffId
    );
    if (!nextTariff) {
      return;
    }

    const nextInput = tariffRateInputFromTariff(nextTariff);
    setOffPeakRateP(nextInput.offPeakPPerKwh);
    setPeakRateP(nextInput.peakPPerKwh);
    setOffPeakShare(nextInput.offPeakSharePct);
    setStandingChargeP(nextInput.standingChargePPerDay);
    setStandingAllocation(nextInput.standingChargeAllocationPct);
  }

  function askAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAgentQuestion(agentDraft);
  }

  function resetCatalogFilters() {
    setCatalogQuery("");
    setCatalogMakeFilter("all");
    setCatalogModelFilter("all");
    setCatalogYearFilter("all");
    setCatalogPowertrainFilter("all");
  }

  async function importDvlaVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportResult("Importing registration data...");
    setProvenanceReport(null);
    setMatchResults([]);

    try {
      const response = await fetch(
        `/api/import/dvla?registration=${encodeURIComponent(registration)}&vehicleId=${encodeURIComponent(selectedCatalogVehicle.id)}&model=${encodeURIComponent(selectedCatalogVehicle.model)}&trim=${encodeURIComponent(selectedCatalogVehicle.trim)}`
      );
      const payload = await response.json();
      if (!response.ok) {
        setImportResult(
          [payload.error, payload.next_step].filter(Boolean).join(" ")
        );
        return;
      }
      setProvenanceReport(payload.provenance);
      setMatchResults(payload.matches ?? []);
      setImportResult(
        `${payload.vehicle.make || "Vehicle"} ${payload.vehicle.model_year ?? ""} ${payload.vehicle.fuel_type ?? ""} CO2 ${payload.vehicle.co2_g_per_km ?? "n/a"} g/km. ${payload.provenance.summary}`
      );
    } catch {
      setImportResult("Vehicle import failed before the request completed.");
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Portfolio data product</p>
          <h1>EV vs ICE Intelligence Lab</h1>
        </div>
        <div className="topbar-actions" aria-label="Project capabilities">
          <span>
            <Database size={16} aria-hidden />
            SQL
          </span>
          <span>
            <BrainCircuit size={16} aria-hidden />
            ML
          </span>
          <span>
            <GitBranch size={16} aria-hidden />
            CI/CD
          </span>
        </div>
      </header>

      <section className="control-band" aria-label="Comparison controls">
        <label className="control-field">
          <span>Scenario</span>
          <select
            value={scenario.scenario_id}
            onChange={(event) => applyScenario(event.target.value)}
          >
            {data.scenarios.map((item) => (
              <option key={item.scenario_id} value={item.scenario_id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <RangeField
          label="Annual miles"
          value={annualMiles}
          min={5000}
          max={30000}
          step={500}
          suffix="mi"
          onChange={setAnnualMiles}
        />
        <RangeField
          label="Ownership"
          value={ownershipYears}
          min={2}
          max={10}
          step={1}
          suffix="yr"
          onChange={setOwnershipYears}
        />
        <RangeField
          label="Home charge"
          value={homeShare}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={setHomeShare}
        />
        <RangeField
          label="Cheap-rate charge"
          value={offPeakShare}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(value) => {
            setSelectedTariffId("custom");
            setOffPeakShare(value);
          }}
        />
      </section>

      <nav className="segment-tabs" aria-label="Vehicle segment">
        {segments.map((item) => (
          <button
            className={segment === item ? "active" : ""}
            key={item}
            onClick={() => setSegment(item)}
            type="button"
          >
            {item === "all" ? "All" : labelise(item)}
          </button>
        ))}
      </nav>

      <section className="metric-grid" aria-label="Scenario highlights">
        <MetricTile
          icon={<Gauge size={22} aria-hidden />}
          label="Lowest cost"
          value={cheapest ? vehicleDisplayName(cheapest) : "n/a"}
          detail={cheapest ? `${money(cheapest.total_cost_per_mile_gbp)}/mile` : ""}
        />
        <MetricTile
          icon={<PlugZap size={22} aria-hidden />}
          label="Cleanest lifecycle"
          value={cleanest ? vehicleDisplayName(cleanest) : "n/a"}
          detail={cleanest ? `${cleanest.lifecycle_tonnes_co2e} tCO2e` : ""}
        />
        <MetricTile
          icon={<BatteryCharging size={22} aria-hidden />}
          label="Blended electricity"
          value={`${money(weightedElectricityPrice(overrides))}/kWh`}
          detail={`${homeShare}% home, ${offPeakShare}% cheap-rate`}
        />
        <MetricTile
          icon={<Fuel size={22} aria-hidden />}
          label="Fuel prices"
          value={`${money(petrolPrice)} / ${money(dieselPrice)}`}
          detail={
            fuelSnapshot ? `petrol / diesel, GOV ${fuelSnapshot.date}` : "petrol / diesel per litre"
          }
        />
      </section>

      <section className="workspace-grid">
        <article className="panel panel-large">
          <PanelTitle icon={<Car size={18} aria-hidden />} title="Vehicle Cost vs CO2e" />
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={330}>
              <ScatterChart margin={{ top: 18, right: 24, bottom: 18, left: 0 }}>
                <CartesianGrid stroke="#dfe5df" strokeDasharray="4 4" />
                <XAxis
                  dataKey="total_cost_per_mile_gbp"
                  name="Cost"
                  tickFormatter={(value) => money(Number(value))}
                  type="number"
                />
                <YAxis
                  dataKey="lifecycle_tonnes_co2e"
                  name="CO2e"
                  tickFormatter={(value) => `${value}t`}
                  type="number"
                />
                <Tooltip content={<VehicleTooltip />} />
                <Scatter data={rows} name="Vehicles">
                  {rows.map((entry) => (
                    <Cell
                      fill={POWERTRAIN_COLORS[entry.powertrain] ?? "#334155"}
                      key={entry.vehicle_id}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel">
          <PanelTitle icon={<Workflow size={18} aria-hidden />} title="Powertrain Summary" />
          <div className="summary-list">
            {summary.map((item) => (
              <div className="summary-row" key={item.powertrain}>
                <span
                  className="dot"
                  style={{
                    background: POWERTRAIN_COLORS[item.powertrain] ?? "#334155"
                  }}
                />
                <div>
                  <strong>{item.powertrain}</strong>
                  <small>{item.vehicles} vehicles</small>
                </div>
                <b>{money(item.avg_total_cost_per_mile_gbp)}/mi</b>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-large">
          <PanelTitle icon={<PlugZap size={18} aria-hidden />} title="UK Tariffs & Fuel" />
          <div className="tariff-controls">
            <label className="tariff-field tariff-select">
              <span>EV tariff</span>
              <select
                onChange={(event) => applyTariff(event.target.value)}
                value={selectedTariffId}
              >
                {data.ev_tariffs.map((tariff) => (
                  <option key={tariff.tariff_id} value={tariff.tariff_id}>
                    {tariffDisplayName(tariff)}
                  </option>
                ))}
                <option value="custom">Custom rates</option>
              </select>
            </label>
            <NumberField
              label="Off-peak p/kWh"
              max={80}
              min={0}
              step={0.1}
              value={offPeakRateP}
              onChange={(value) => {
                setSelectedTariffId("custom");
                setOffPeakRateP(value);
              }}
            />
            <NumberField
              label="Peak p/kWh"
              max={90}
              min={0}
              step={0.1}
              value={peakRateP}
              onChange={(value) => {
                setSelectedTariffId("custom");
                setPeakRateP(value);
              }}
            />
            <NumberField
              label="Standing p/day"
              max={120}
              min={0}
              step={0.1}
              value={standingChargeP}
              onChange={(value) => {
                setSelectedTariffId("custom");
                setStandingChargeP(value);
              }}
            />
            <NumberField
              label="Petrol p/litre"
              max={300}
              min={80}
              step={0.1}
              value={roundForInput(petrolPrice * 100)}
              onChange={(value) => setPetrolPrice(value / 100)}
            />
            <NumberField
              label="Diesel p/litre"
              max={320}
              min={80}
              step={0.1}
              value={roundForInput(dieselPrice * 100)}
              onChange={(value) => setDieselPrice(value / 100)}
            />
            <RangeField
              label="Standing allocation"
              max={100}
              min={0}
              step={5}
              suffix="%"
              value={standingAllocation}
              onChange={setStandingAllocation}
            />
          </div>
          <div className="energy-comparison-grid">
            {tariffComparisonRows.map((row) => (
              <div className="energy-card" key={row.vehicle_id}>
                <span>{row.powertrain}</span>
                <strong>{row.vehicle}</strong>
                <b>{money(row.annual_total_cost_gbp)}/yr</b>
                <small>
                  {row.pence_per_mile}p/mi - {row.annual_energy_units.toLocaleString("en-GB")}{" "}
                  {row.energy_unit}
                </small>
                {row.annual_standing_cost_gbp > 0 ? (
                  <em>{money(row.annual_standing_cost_gbp)} standing charge</em>
                ) : (
                  <em>{row.unit_rate_label}</em>
                )}
              </div>
            ))}
          </div>
          <div className="source-strip">
            {selectedTariff?.source_url ? (
              <a href={selectedTariff.source_url} rel="noreferrer" target="_blank">
                {tariffSourceLabel}
              </a>
            ) : (
              <span>{tariffSourceLabel}</span>
            )}
            <span>
              Fuel:{" "}
              {fuelSnapshot
                ? `${fuelSnapshot.source_name}, ${fuelSnapshot.date}${fuelSnapshot.stale ? " fallback" : ""}`
                : "live GOV.UK refresh pending"}
            </span>
            <span>
              Standing:{" "}
              {selectedTariff?.standing_charge_source ?? "custom user value"}
            </span>
          </div>
          {selectedTariff?.secondary_source_value_note ? (
            <p className="tariff-note">{selectedTariff.secondary_source_value_note}</p>
          ) : null}
        </article>

        <article className="panel">
          <PanelTitle icon={<Car size={18} aria-hidden />} title="Trim-Aware Catalog" />
          <div className="catalog-coverage" aria-label="Catalog coverage">
            <span>{catalogCoverage.trims} trims</span>
            <span>{catalogCoverage.makes} makes</span>
            <span>{catalogCoverage.models} models</span>
            <span>
              {catalogCoverage.minAvailabilityYear}-{catalogCoverage.maxAvailabilityYear}
            </span>
          </div>
          <div className="catalog-controls">
            <label>
              <span>Search</span>
              <input
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder="make, model, trim, fuel"
                value={catalogQuery}
              />
            </label>
            <label>
              <span>Make</span>
              <select
                onChange={(event) => {
                  setCatalogMakeFilter(event.target.value);
                  setCatalogModelFilter("all");
                }}
                value={catalogMakeFilter}
              >
                <option value="all">All makes</option>
                {catalogMakes.map((make) => (
                  <option key={make} value={make}>
                    {make}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Model</span>
              <select
                onChange={(event) => setCatalogModelFilter(event.target.value)}
                value={catalogModelFilter}
              >
                <option value="all">All models</option>
                {catalogModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Available in</span>
              <select
                onChange={(event) => setCatalogYearFilter(event.target.value)}
                value={catalogYearFilter}
              >
                <option value="all">Any year</option>
                {catalogYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Powertrain</span>
              <select
                onChange={(event) => setCatalogPowertrainFilter(event.target.value)}
                value={catalogPowertrainFilter}
              >
                <option value="all">All powertrains</option>
                {catalogPowertrains.map((powertrain) => (
                  <option key={powertrain} value={powertrain}>
                    {powertrain}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="catalog-actions">
            <button onClick={resetCatalogFilters} type="button">
              Reset
            </button>
            <span>
              Showing {filteredCatalogVehicles.length} of {data.vehicles.length}
            </span>
          </div>
          <div className="catalog-results" aria-label="Catalog results">
            {filteredCatalogVehicles.slice(0, 8).map((vehicle) => (
              <button
                className={vehicle.id === selectedCatalogVehicle.id ? "active" : ""}
                key={vehicle.id}
                onClick={() => setSelectedVehicleId(vehicle.id)}
                type="button"
              >
                <span>
                  <b>{vehicleDisplayName(vehicle)}</b>
                  <small>
                    {vehicle.available_from_year}-{vehicle.available_to_year} {vehicle.powertrain} - {vehicle.uk_market_status}
                  </small>
                </span>
                <em>{vehicleCatalogLabel(vehicle)}</em>
              </button>
            ))}
          </div>
          <div className="catalog-card">
            <strong>{vehicleDisplayName(selectedCatalogVehicle)}</strong>
            <span>
              {selectedCatalogVehicle.model_year} {selectedCatalogVehicle.uk_market_status} UK {selectedCatalogVehicle.body_style}
            </span>
            <dl>
              <div>
                <dt>Price</dt>
                <dd>{money(selectedCatalogVehicle.purchase_price_gbp)}</dd>
              </div>
              <div>
                <dt>Efficiency</dt>
                <dd>
                  {selectedCatalogVehicle.efficiency_value}{" "}
                  {selectedCatalogVehicle.efficiency_unit === "kwh_per_100km"
                    ? "kWh/100km"
                    : "L/100km"}
                </dd>
              </div>
              <div>
                <dt>Scenario cost</dt>
                <dd>
                  {selectedCatalogRow
                    ? `${money(selectedCatalogRow.total_cost_per_mile_gbp)}/mi`
                    : "n/a"}
                </dd>
              </div>
              <div>
                <dt>Lifecycle</dt>
                <dd>
                  {selectedCatalogRow
                    ? `${selectedCatalogRow.lifecycle_tonnes_co2e} tCO2e`
                    : "n/a"}
                </dd>
              </div>
            </dl>
          </div>
          <label className="selected-trim-select">
            <span>Selected model trims across all years</span>
            <select
              onChange={(event) => setSelectedVehicleId(event.target.value)}
              value={selectedCatalogVehicle.id}
            >
              {catalogTrimsForSelectedModel.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.model_year} {vehicle.trim}
                </option>
              ))}
            </select>
          </label>
          <form className="dvla-form" onSubmit={importDvlaVehicle}>
            <input
              aria-label="UK registration"
              onChange={(event) => setRegistration(event.target.value)}
              placeholder="UK reg lookup"
              value={registration}
            />
            <button title="Import DVLA vehicle data" type="submit">
              <Search size={16} aria-hidden />
              <span>Import</span>
            </button>
          </form>
          {importResult ? <p className="import-result">{importResult}</p> : null}
          {matchResults.length > 0 ? (
            <div className="match-panel">
              <strong>Likely Trim Matches</strong>
              {matchResults.map((match) => (
                <button
                  key={match.vehicle_id}
                  onClick={() => setSelectedVehicleId(match.vehicle_id)}
                  type="button"
                >
                  <span>
                    <b>{match.vehicle}</b>
                    <small>{match.reasons.slice(0, 2).join(" ")}</small>
                  </span>
                  <em>{match.confidence}%</em>
                </button>
              ))}
            </div>
          ) : null}
          {provenanceReport ? (
            <div className="provenance-panel">
              <strong>Source Comparison</strong>
              <span>{provenanceReport.summary}</span>
              <div className="provenance-list">
                {provenanceReport.comparisons.map((comparison) => (
                  <div
                    className={`provenance-row ${comparison.status}`}
                    key={comparison.field}
                  >
                    <div>
                      <b>{comparison.label}</b>
                      <small>{comparison.message}</small>
                    </div>
                    <div className="source-values">
                      {comparison.values.map((item) => (
                        <span key={`${comparison.field}-${item.source}`}>
                          <em>{item.source}</em>
                          {formatSourceValue(item.value)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel panel-large">
          <PanelTitle icon={<Database size={18} aria-hidden />} title="Ranked Comparison" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Year</th>
                  <th>Type</th>
                  <th>Cost / mile</th>
                  <th>Energy / yr</th>
                  <th>Lifecycle CO2e</th>
                  <th>Break-even</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 9).map((row) => (
                  <tr key={row.vehicle_id}>
                    <td>
                      <strong>{row.make}</strong>
                      <span>
                        {row.model} {row.trim}
                      </span>
                    </td>
                    <td>{row.model_year}</td>
                    <td>{row.powertrain}</td>
                    <td>{money(row.total_cost_per_mile_gbp)}</td>
                    <td>{money(row.annual_energy_cost_gbp)}</td>
                    <td>{row.lifecycle_tonnes_co2e} t</td>
                    <td>
                      {row.break_even_miles_vs_segment_ice
                        ? compactNumber(row.break_even_miles_vs_segment_ice)
                        : "n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <PanelTitle icon={<BrainCircuit size={18} aria-hidden />} title="ML Cost Model" />
          <div className="model-score">
            <strong>{data.model.r2}</strong>
            <span>R2</span>
            <strong>{money(data.model.mae_gbp_per_mile)}</strong>
            <span>MAE / mile</span>
          </div>
          <div className="importance-list">
            {data.model.feature_importance.slice(0, 6).map((item) => (
              <div className="importance" key={item.feature}>
                <span>{cleanFeature(item.feature)}</span>
                <i style={{ width: `${Math.max(item.importance * 100, 4)}%` }} />
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <PanelTitle icon={<Gauge size={18} aria-hidden />} title="Signal Processing" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.signal_processing} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#dfe5df" strokeDasharray="4 4" />
              <XAxis dataKey="cycle" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="energy_stress_score"
                fill="#0f766e"
                name="Energy stress"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="stop_share_pct"
                fill="#b45309"
                name="Stop share %"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="panel panel-large">
          <PanelTitle icon={<Bot size={18} aria-hidden />} title="Agentic RAG Advisor" />
          <form className="agent-form" onSubmit={askAgent}>
            <input
              aria-label="Agent question"
              onChange={(event) => setAgentDraft(event.target.value)}
              value={agentDraft}
            />
            <button title="Run advisor" type="submit">
              <Search size={16} aria-hidden />
              <span>Ask</span>
            </button>
          </form>
          <p className="agent-answer">{agentResult.answer}</p>
          {agentResult.recommendation ? (
            <div className="agent-recommendation">
              <strong>{agentResult.recommendation.vehicle}</strong>
              <span>{agentResult.recommendation.reason}</span>
            </div>
          ) : null}
          <div className="agent-grid">
            <div>
              <div className="mini-title">
                <ListChecks size={15} aria-hidden />
                Steps
              </div>
              <ol className="agent-steps">
                {agentResult.steps.map((step) => (
                  <li key={step.step}>
                    <strong>{step.action}</strong>
                    <span>{step.observation}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <div className="mini-title">
                <Database size={15} aria-hidden />
                Citations
              </div>
              <div className="citation-list">
                {agentResult.citations.map((hit) => (
                  <a href={`/api/rag?q=${encodeURIComponent(agentQuestion)}`} key={hit.id}>
                    <strong>{hit.title}</strong>
                    <span>{hit.source}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="panel">
          <PanelTitle icon={<Database size={18} aria-hidden />} title="REST API Preview" />
          <code className="api-url">{selectedApiUrl}</code>
          <pre className="api-sample">
            {JSON.stringify(
              {
                scenario: scenario.scenario_id,
                rows: rows.length,
                top_result: rows[0]
                  ? {
                      vehicle: vehicleDisplayName(rows[0]),
                      cost_per_mile: rows[0].total_cost_per_mile_gbp,
                      lifecycle_tonnes: rows[0].lifecycle_tonnes_co2e
                    }
                  : null
              },
              null,
              2
            )}
          </pre>
        </article>
      </section>
    </main>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  prefix = "",
  suffix = ""
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="control-field range-field">
      <span>
        {label}
        <output>
          {prefix}
          {formatControlValue(value)}
          {suffix}
        </output>
      </span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="tariff-field">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

function MetricTile({
  icon,
  label,
  value,
  detail
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-tile">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function VehicleTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ payload: ScenarioResult }>;
}) {
  if (!active || !payload?.[0]) {
    return null;
  }
  const row = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>
        {vehicleDisplayName(row)}
      </strong>
      <span>
        {row.model_year} {row.powertrain}
      </span>
      <span>{money(row.total_cost_per_mile_gbp)}/mile</span>
      <span>{row.lifecycle_tonnes_co2e} tCO2e</span>
    </div>
  );
}

function money(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: value < 2 ? 2 : 0
  }).format(value);
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${trimDecimal(value / 1_000_000)}m`;
  }
  if (value >= 1_000) {
    return `${trimDecimal(value / 1_000)}k`;
  }
  return Math.round(value).toLocaleString("en-GB");
}

function formatControlValue(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("en-GB")
    : value.toFixed(2);
}

function roundForInput(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function labelise(value: string): string {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function cleanFeature(value: string): string {
  return value.replaceAll("_", " ").replace("powertrain ", "");
}

function formatSourceValue(value: string | number | null): string {
  if (value === null || value === "") {
    return "Not supplied";
  }
  return String(value);
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(".0", "");
}
