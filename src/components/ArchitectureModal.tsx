"use client";

import { Cpu, Database, Layers, Network, X } from "lucide-react";
import { useEffect } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function ArchitectureModal({ isOpen, onClose }: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="arch-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="arch-title">
      <div className="arch-modal-window" onClick={(e) => e.stopPropagation()}>
        <header className="arch-modal-header">
          <div>
            <span className="eyebrow">Full-Stack Data Engineering &amp; ML Architecture</span>
            <h2 id="arch-title">System Lineage &amp; Data Pipeline</h2>
          </div>
          <button className="arch-modal-close" onClick={onClose} aria-label="Close architecture modal">
            <X size={20} />
          </button>
        </header>

        <div className="arch-modal-content">
          <p className="arch-modal-intro">
            This project is engineered as an end-to-end reproducible data product. Real government and market datasets are ingested, validated, transformed into analytical and SQLite formats, modeled with machine learning, and served through a low-latency App Router interface.
          </p>

          <div className="arch-pipeline-flow">
            <div className="arch-stage">
              <div className="arch-stage-header">
                <Database size={18} className="arch-stage-icon" />
                <h3>1. Ingestion Layer</h3>
              </div>
              <ul className="arch-stage-items">
                <li>
                  <strong>GOV.UK / DESNZ:</strong> Weekly road fuel CSV endpoint (petrol &amp; diesel live pump prices).
                </li>
                <li>
                  <strong>National Grid ESO:</strong> Half-hourly real-time carbon intensity and fuel generation mix API.
                </li>
                <li>
                  <strong>OpenChargeMap:</strong> GeoJSON charging infrastructure registry with kW power bands.
                </li>
                <li>
                  <strong>DVLA &amp; VCA:</strong> Registration enquiry API + official car fuel and CO₂ emissions catalogs.
                </li>
                <li>
                  <strong>UK EV Energy Tariffs:</strong> Curated multi-supplier time-of-use and smart charging rates.
                </li>
              </ul>
            </div>

            <div className="arch-stage-arrow">&rarr;</div>

            <div className="arch-stage">
              <div className="arch-stage-header">
                <Cpu size={18} className="arch-stage-icon" />
                <h3>2. Python Pipeline &amp; ML</h3>
              </div>
              <ul className="arch-stage-items">
                <li>
                  <strong>Pandas &amp; Pandera:</strong> Schema validation, upstream fuel-cycle factors (Well-to-Wheel), and TCO amortization.
                </li>
                <li>
                  <strong>SciPy Signal Processing:</strong> Power spectral density and jerk analysis over WLTP drive cycles.
                </li>
                <li>
                  <strong>Scikit-Learn Surrogate Model:</strong> Lightweight RandomForestRegressor trained on 120k synthetic scenario rows with single-thread permutation importance.
                </li>
                <li>
                  <strong>PyTorch &amp; ONNX:</strong> ConnectorCNN trained to classify EV charging plugs, exported to an ONNX graph for server-side nodejs inference.
                </li>
              </ul>
            </div>

            <div className="arch-stage-arrow">&rarr;</div>

            <div className="arch-stage">
              <div className="arch-stage-header">
                <Layers size={18} className="arch-stage-icon" />
                <h3>3. Generated Artifacts</h3>
              </div>
              <ul className="arch-stage-items">
                <li>
                  <strong>SQLite Database:</strong> <code>data/processed/ev_ice_comparison.sqlite</code> relational schema with source registry &amp; provenance tracking.
                </li>
                <li>
                  <strong>Production JSON:</strong> Static portfolio dataset embedded directly for instant initial render.
                </li>
                <li>
                  <strong>RAG Knowledge Corpus:</strong> Inverted index with BM25/TF-IDF sparse scoring over 240+ documents.
                </li>
              </ul>
            </div>

            <div className="arch-stage-arrow">&rarr;</div>

            <div className="arch-stage">
              <div className="arch-stage-header">
                <Network size={18} className="arch-stage-icon" />
                <h3>4. Next.js App Router</h3>
              </div>
              <ul className="arch-stage-items">
                <li>
                  <strong>220 Static Pages:</strong> SSG dynamic routing for individual vehicle economics with schema.org <code>Car</code> JSON-LD.
                </li>
                <li>
                  <strong>REST API Endpoints:</strong> OpenAPI 3.1 compliant routes for health, scenarios, comparisons, tariffs, and RAG.
                </li>
                <li>
                  <strong>Agentic Advisor:</strong> Deterministic 5-step transparent reasoning agent with citations and live fleet re-evaluation.
                </li>
                <li>
                  <strong>Interactive UI:</strong> Recharts reactive scatter plots, CartoDB Positron Leaflet mapping, and live drag-and-drop plug classification.
                </li>
              </ul>
            </div>
          </div>

          <div className="arch-modal-specs">
            <div className="arch-spec-card">
              <span>Primary Engine</span>
              <strong>Python 3.11 + Next.js 16</strong>
            </div>
            <div className="arch-spec-card">
              <span>ML Accuracy</span>
              <strong>R² 1.0 · MAE £0.004/mi</strong>
            </div>
            <div className="arch-spec-card">
              <span>ONNX Latency</span>
              <strong>&lt; 5ms Node.js Inference</strong>
            </div>
            <div className="arch-spec-card">
              <span>Compliance</span>
              <strong>TypeScript Strict · ESLint 9 · Vitest</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
