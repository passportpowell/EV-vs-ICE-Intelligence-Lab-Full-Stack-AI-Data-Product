"use client";

import { ScanEye, Zap } from "lucide-react";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ChargingStation, ChargingStationsFeed } from "@/lib/openchargemap";
import type { CvModelReport } from "@/lib/types";

type LeafletNamespace = {
  map: (
    el: HTMLElement,
    opts?: { center?: [number, number]; zoom?: number }
  ) => LeafletMap;
  tileLayer: (
    url: string,
    opts?: { attribution?: string; maxZoom?: number; subdomains?: string; [key: string]: unknown }
  ) => { addTo: (map: LeafletMap) => void };
  circleMarker: (
    latlng: [number, number],
    opts?: Record<string, unknown>
  ) => LeafletMarker;
  layerGroup: () => LeafletLayerGroup;
};

type LeafletMap = {
  setView: (latlng: [number, number], zoom: number) => LeafletMap;
  fitBounds: (bounds: Array<[number, number]>) => void;
  remove: () => void;
};

type LeafletMarker = {
  bindPopup: (html: string) => LeafletMarker;
  addTo: (target: LeafletMap | LeafletLayerGroup) => LeafletMarker;
};

type LeafletLayerGroup = {
  addTo: (map: LeafletMap) => LeafletLayerGroup;
  clearLayers: () => void;
};

declare global {
  interface Window {
    L?: LeafletNamespace;
  }
}

const COLOR_BY_POWER: Array<{ min: number; color: string; label: string }> = [
  { min: 200, color: "#0f766e", label: "200+ kW (Ultra-rapid)" },
  { min: 100, color: "#2563eb", label: "100-199 kW (Rapid)" },
  { min: 50, color: "#b45309", label: "50-99 kW" },
  { min: 7, color: "#475569", label: "7-49 kW" },
  { min: 0, color: "#94a3b8", label: "Unknown / unspecified" },
];

function colorForPower(power: number): string {
  return (
    COLOR_BY_POWER.find((band) => power >= band.min)?.color ?? "#475569"
  );
}

type ChargingMapProps = {
  cvModel?: CvModelReport;
};

type LiveCvPrediction = {
  predicted: string;
  confidence: number;
  probabilities: Record<string, number>;
  inference_ms: number;
};

export function ChargingMap({ cvModel }: ChargingMapProps) {
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LeafletLayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [feed, setFeed] = useState<ChargingStationsFeed | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // 50 kW floor matches the OpenChargeMap "rapid" tier — anything below
    // that is mostly slow destination chargers we don't want to plot for
    // a national-scale view. Markers are coloured by power so users can
    // visually identify ultra-rapid sites without an explicit filter.
    fetch("/api/charging-stations?minPowerKw=0&limit=2000", {
      cache: "no-store",
    })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("fetch failed"))
      )
      .then((payload: ChargingStationsFeed) => {
        if (!active) return;
        setFeed(payload);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Could not load charging stations");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!leafletReady || !feed || !containerRef.current) return;
    const L = window.L;
    if (!L) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center: [54.6, -3.5],
        zoom: 5,
      });
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          maxZoom: 19,
          subdomains: "abcd",
        }
      ).addTo(mapRef.current);
      layerRef.current = L.layerGroup().addTo(mapRef.current);
    }

    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    feed.stations.forEach((station) => {
      const marker = L.circleMarker([station.lat, station.lng], {
        radius: station.max_power_kw >= 200 ? 7 : 5,
        color: colorForPower(station.max_power_kw),
        fillColor: colorForPower(station.max_power_kw),
        fillOpacity: 0.78,
        weight: 1.5,
      });
      marker.bindPopup(buildPopup(station));
      marker.addTo(layer);
    });

    return () => {
      // Layer is reused on re-renders; nothing to teardown here.
    };
  }, [feed, leafletReady]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  // ----- CV connector classifier (optional) -----
  const cvSamples = useMemo(() => {
    if (!cvModel) return [];
    const seen = new Set<string>();
    return cvModel.sample_predictions.filter((s) => {
      if (seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    });
  }, [cvModel]);

  const [activeCvSampleUrl, setActiveCvSampleUrl] = useState<string>(
    cvSamples[0]?.url ?? ""
  );
  const [cvPrediction, setCvPrediction] = useState<LiveCvPrediction | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);
  const activeCvSample = useMemo(
    () => cvSamples.find((s) => s.url === activeCvSampleUrl) ?? cvSamples[0],
    [activeCvSampleUrl, cvSamples]
  );

  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvError(null);
    setCvPrediction(null);
    try {
      const url = URL.createObjectURL(file);
      setUploadedImageUrl(url);
      setActiveCvSampleUrl("");
      const response = await fetch("/api/cv/classify-connector", {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: file,
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error ?? `Upload classification failed (${response.status})`);
      }
      const data = (await response.json()) as LiveCvPrediction;
      setCvPrediction(data);
    } catch (err: unknown) {
      setCvError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    if (!activeCvSample || !activeCvSampleUrl) return;
    let active = true;
    const sampleId = activeCvSample.url
      .split("/")
      .pop()
      ?.replace(/\.png$/, "");
    if (!sampleId) return;
    fetch(`/api/cv/classify-connector?sample=${encodeURIComponent(sampleId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as LiveCvPrediction;
      })
      .then((payload) => {
        if (!active) return;
        setCvPrediction(payload);
        setCvError(null);
      })
      .catch((err: unknown) => {
        if (active) setCvError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [activeCvSample, activeCvSampleUrl]);

  const sortedCvProbs = useMemo(() => {
    if (!cvPrediction) return [];
    return Object.entries(cvPrediction.probabilities).sort(
      (a, b) => b[1] - a[1]
    );
  }, [cvPrediction]);

  const stats = useMemo(() => {
    if (!feed) return null;
    const stations = feed.stations;
    const total = stations.length;
    const avgPower =
      total > 0
        ? stations.reduce((sum, s) => sum + s.max_power_kw, 0) / total
        : 0;
    const operatorCounts = new Map<string, number>();
    for (const station of stations) {
      operatorCounts.set(
        station.operator,
        (operatorCounts.get(station.operator) ?? 0) + 1
      );
    }
    const topOperator =
      Array.from(operatorCounts.entries()).sort((a, b) => b[1] - a[1])[0] ?? [
        "—",
        0,
      ];
    const ultra = stations.filter((s) => s.max_power_kw >= 200).length;
    return {
      total,
      avgPower: Math.round(avgPower),
      ultra,
      topOperator: topOperator[0],
      topOperatorCount: topOperator[1],
    };
  }, [feed]);

  return (
    <article className="panel panel-full">
      <div className="panel-title">
        <Zap size={18} aria-hidden />
        <h2>UK Charging Coverage</h2>
      </div>
      <p className="panel-intro">
        Live OpenChargeMap data plotted on OpenStreetMap tiles. Markers are
        coloured by maximum charging power; click for operator, town, and
        connector breakdown. Filter by minimum power to focus on rapid /
        ultra-rapid sites.
      </p>
      <div className="charging-legend" aria-label="Marker legend">
        {COLOR_BY_POWER.map((band) => (
          <span key={band.label}>
            <i style={{ background: band.color }} />
            {band.label}
          </span>
        ))}
      </div>
      <div className="charging-grid">
        <div className="charging-stats">
          {stats ? (
            <>
              <div>
                <span>Stations</span>
                <strong>{stats.total}</strong>
              </div>
              <div>
                <span>Avg power</span>
                <strong>{stats.avgPower} kW</strong>
              </div>
              <div>
                <span>Ultra-rapid</span>
                <strong>{stats.ultra}</strong>
              </div>
              <div>
                <span>Top operator</span>
                <strong>{stats.topOperator}</strong>
                <small>{stats.topOperatorCount} sites</small>
              </div>
            </>
          ) : (
            <div className="charging-loading">Loading…</div>
          )}
        </div>
        <div className="charging-map" ref={containerRef} />
      </div>
      {feed?.stale ? (
        <p className="charging-note">{feed.note}</p>
      ) : feed ? (
        <p className="charging-note">
          Source: <a href={feed.source_url} rel="noreferrer" target="_blank">{feed.source_name}</a>
          {" · "}fetched {new Date(feed.fetched_at).toLocaleString("en-GB")}
        </p>
      ) : error ? (
        <p className="charging-note">{error}</p>
      ) : null}

      {cvModel && cvSamples.length > 0 ? (
        <details className="connector-details">
          <summary>
            <ScanEye size={15} aria-hidden /> Identify a connector type
          </summary>
          <p className="connector-help">
            Stations on the map use different plug types — Type 2 for AC home
            charging, CCS for most rapid DC, CHAdeMO for older Nissan / Toyota
            EVs, Tesla NACS, or a domestic 3-pin trickle. Pick a silhouette
            below and the dataset&rsquo;s {cvModel.framework} CNN classifies it
            in real time via{" "}
            <code>/api/cv/classify-connector</code> (ONNX runtime,{" "}
            {cvModel.parameters.toLocaleString("en-GB")} params,{" "}
            {(cvModel.accuracy * 100).toFixed(0)}% validation accuracy).
          </p>
          <div className="connector-grid">
            <div className="connector-samples">
              {cvSamples.map((sample) => (
                <button
                  className={
                    sample.url === activeCvSampleUrl
                      ? "connector-sample active"
                      : "connector-sample"
                  }
                  key={sample.url}
                  onClick={() => {
                    setUploadedImageUrl(null);
                    setActiveCvSampleUrl(sample.url);
                  }}
                  type="button"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sample.url}
                    alt={`${sample.label} silhouette`}
                    width={56}
                    height={56}
                  />
                  <span>{sample.label}</span>
                </button>
              ))}

              <label className="connector-sample connector-upload-btn" title="Upload a PNG image of an EV connector to test ONNX model inference">
                <input
                  type="file"
                  accept="image/png"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                <span className="upload-icon">+</span>
                <span>Upload PNG</span>
              </label>
            </div>
            <div className="connector-prediction">
              {cvError ? (
                <p className="cv-error">{cvError}</p>
              ) : cvPrediction ? (
                <>
                  <div className="connector-headline">
                    {uploadedImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={uploadedImageUrl}
                        alt="Uploaded connector preview"
                        className="connector-uploaded-preview"
                        width={44}
                        height={44}
                      />
                    ) : null}
                    <div>
                      <span>Top prediction</span>
                      <strong>{cvPrediction.predicted}</strong>
                      <em>
                        {(cvPrediction.confidence * 100).toFixed(1)}% ·{" "}
                        {cvPrediction.inference_ms.toFixed(1)} ms inference
                      </em>
                    </div>
                  </div>
                  <ul className="cv-probs">
                    {sortedCvProbs.map(([label, prob]) => (
                      <li key={label}>
                        <span>{label}</span>
                        <i style={{ width: `${prob * 100}%` }} />
                        <em>{(prob * 100).toFixed(1)}%</em>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="cv-loading">Running ONNX inference…</p>
              )}
            </div>
          </div>
        </details>
      ) : null}

      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <Script
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
        crossOrigin=""
        strategy="afterInteractive"
        onLoad={() => setLeafletReady(true)}
      />
    </article>
  );
}

function buildPopup(station: ChargingStation): string {
  const connectorList = station.connectors
    .map(
      (c) =>
        `${escapeHtml(c.type)} · ${c.power_kw} kW × ${c.quantity}`
    )
    .join("<br />");
  return `
    <strong>${escapeHtml(station.title)}</strong><br />
    <span style="color:#5d6b64">${escapeHtml(station.operator)} · ${escapeHtml(
      station.town || station.postcode
    )}</span><br />
    <span style="color:#0f766e;font-weight:700">Max ${station.max_power_kw} kW</span><br />
    ${connectorList}
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
