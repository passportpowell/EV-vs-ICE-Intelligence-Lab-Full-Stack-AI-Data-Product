import { adjustedEfficiency, round } from "@/lib/calculations";
import type {
  EnergyComparisonRow,
  EvTariff,
  ScenarioOverrides,
  TariffRateInput,
  Vehicle
} from "@/lib/types";
import { vehicleDisplayName } from "@/lib/vehicles";

const MILES_TO_KM = 1.609344;

export function tariffDisplayName(tariff: EvTariff): string {
  return `${tariff.supplier} - ${tariff.tariff_name}`;
}

export function tariffRateInputFromTariff(
  tariff: EvTariff,
  offPeakSharePct = tariff.tariff_category === "smart_charging_add_on" ? 100 : 90,
  standingChargeAllocationPct = tariff.standing_charge_p_per_day > 0 ? 100 : 0
): TariffRateInput {
  return {
    offPeakPPerKwh: tariff.default_off_peak_p_per_kwh,
    peakPPerKwh: tariff.peak_p_per_kwh ?? tariff.default_off_peak_p_per_kwh,
    offPeakSharePct,
    standingChargePPerDay: tariff.standing_charge_p_per_day,
    standingChargeAllocationPct
  };
}

export function blendedHomeTariffGbpPerKwh(input: TariffRateInput): number {
  const offPeakShare = clamp(input.offPeakSharePct, 0, 100) / 100;
  const pencePerKwh =
    input.offPeakPPerKwh * offPeakShare + input.peakPPerKwh * (1 - offPeakShare);

  return round(pencePerKwh / 100, 4);
}

export function selectComparisonVehicles(
  vehicles: Vehicle[],
  selectedVehicle?: Vehicle
): { ev?: Vehicle; petrol?: Vehicle; diesel?: Vehicle } {
  const targetSegment = selectedVehicle?.segment;
  const bySegment = targetSegment
    ? vehicles.filter((vehicle) => vehicle.segment === targetSegment)
    : vehicles;
  const candidates = bySegment.length > 0 ? bySegment : vehicles;

  return {
    ev:
      pickVehicle(candidates, selectedVehicle, "electric") ??
      pickVehicle(vehicles, selectedVehicle, "electric"),
    petrol:
      pickVehicle(candidates, selectedVehicle, "petrol") ??
      pickVehicle(vehicles, selectedVehicle, "petrol"),
    diesel:
      pickVehicle(candidates, selectedVehicle, "diesel") ??
      pickVehicle(vehicles, selectedVehicle, "diesel")
  };
}

export function calculateAnnualEnergyCost(
  vehicle: Vehicle,
  scenario: ScenarioOverrides,
  tariffInput: TariffRateInput
): EnergyComparisonRow {
  const annualDistanceKm = scenario.annualMiles * MILES_TO_KM;
  const annualUnits = (annualDistanceKm * adjustedEfficiency(vehicle, scenario)) / 100;

  if (vehicle.fuel_type === "electric") {
    const homeShare = clamp(scenario.homeChargingSharePct, 0, 100) / 100;
    const homeKwh = annualUnits * homeShare;
    const publicKwh = annualUnits - homeKwh;
    const homeUnitCost = homeKwh * blendedHomeTariffGbpPerKwh(tariffInput);
    const publicCost = publicKwh * scenario.publicRapidGbpPerKwh;
    const standingCost =
      (tariffInput.standingChargePPerDay / 100) *
      365 *
      (clamp(tariffInput.standingChargeAllocationPct, 0, 100) / 100);
    const annualTotal = homeUnitCost + publicCost + standingCost;

    return {
      vehicle_id: vehicle.id,
      vehicle: vehicleDisplayName(vehicle),
      powertrain: vehicle.powertrain,
      fuel_type: vehicle.fuel_type,
      annual_energy_units: round(annualUnits, 1),
      energy_unit: "kWh",
      annual_unit_cost_gbp: round(homeUnitCost + publicCost, 2),
      annual_standing_cost_gbp: round(standingCost, 2),
      annual_total_cost_gbp: round(annualTotal, 2),
      pence_per_mile: round((annualTotal / scenario.annualMiles) * 100, 1),
      unit_rate_label: `${formatPence(tariffInput.offPeakPPerKwh)} off-peak / ${formatPence(tariffInput.peakPPerKwh)} peak`
    };
  }

  const fuelPrice =
    vehicle.fuel_type === "diesel"
      ? scenario.dieselGbpPerLitre
      : scenario.petrolGbpPerLitre;
  const annualTotal = annualUnits * fuelPrice;

  return {
    vehicle_id: vehicle.id,
    vehicle: vehicleDisplayName(vehicle),
    powertrain: vehicle.powertrain,
    fuel_type: vehicle.fuel_type,
    annual_energy_units: round(annualUnits, 1),
    energy_unit: "litres",
    annual_unit_cost_gbp: round(annualTotal, 2),
    annual_standing_cost_gbp: 0,
    annual_total_cost_gbp: round(annualTotal, 2),
    pence_per_mile: round((annualTotal / scenario.annualMiles) * 100, 1),
    unit_rate_label: `${formatPence(fuelPrice * 100)}/litre`
  };
}

export function buildEnergyComparisonRows(
  vehicles: Vehicle[],
  selectedVehicle: Vehicle | undefined,
  scenario: ScenarioOverrides,
  tariffInput: TariffRateInput
): EnergyComparisonRow[] {
  const selected = selectComparisonVehicles(vehicles, selectedVehicle);

  return [selected.ev, selected.petrol, selected.diesel]
    .filter((vehicle): vehicle is Vehicle => Boolean(vehicle))
    .map((vehicle) => calculateAnnualEnergyCost(vehicle, scenario, tariffInput));
}

function pickVehicle(
  vehicles: Vehicle[],
  selectedVehicle: Vehicle | undefined,
  fuelType: Vehicle["fuel_type"]
): Vehicle | undefined {
  if (selectedVehicle?.fuel_type === fuelType) {
    return selectedVehicle;
  }

  return [...vehicles]
    .filter((vehicle) => vehicle.fuel_type === fuelType)
    .sort((a, b) => {
      const currentFirst =
        Number(b.uk_market_status === "current") -
        Number(a.uk_market_status === "current");
      return (
        currentFirst ||
        b.model_year - a.model_year ||
        a.purchase_price_gbp - b.purchase_price_gbp
      );
    })[0];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatPence(value: number): string {
  return `${round(value, 2)}p`;
}
