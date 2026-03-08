import { useState, useCallback, useEffect, useRef } from "react";
import axios from "axios";

const API = "https://m8dbfucuzj.execute-api.ap-south-1.amazonaws.com/prod";

const COLORS = {
  bg: "#0a0e1a",
  surface: "#111827",
  border: "#1e2d40",
  accent: "#00d4aa",
  accentDim: "#00d4aa22",
  warn: "#f59e0b",
  danger: "#ef4444",
  success: "#10b981",
  text: "#e2e8f0",
  muted: "#64748b",
  policy: "#3b82f6",
  eligibility: "#00d4aa",
  disqualification: "#ef4444",
};

const style = {
  app: {
    minHeight: "100vh",
    background: COLORS.bg,
    color: COLORS.text,
    fontFamily: "'DM Mono', 'Courier New', monospace",
  },
  nav: {
    borderBottom: `1px solid ${COLORS.border}`,
    padding: "0 2rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "60px",
    background: "#0d1220",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  logo: {
    fontSize: "1rem",
    fontWeight: "700",
    color: COLORS.accent,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
  },
  tabs: { display: "flex", gap: "0.25rem" },
  tab: (active) => ({
    padding: "0.4rem 1rem",
    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
    borderRadius: "4px",
    background: active ? COLORS.accentDim : "transparent",
    color: active ? COLORS.accent : COLORS.muted,
    cursor: "pointer",
    fontSize: "0.75rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  }),
  main: { maxWidth: "1100px", margin: "0 auto", padding: "2rem" },
  card: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "8px",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  },
  label: {
    fontSize: "0.7rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: COLORS.muted,
    marginBottom: "0.5rem",
    display: "block",
  },
  input: {
    width: "100%",
    background: COLORS.bg,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "4px",
    padding: "0.6rem 0.8rem",
    color: COLORS.text,
    fontSize: "0.9rem",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  btn: (variant = "primary") => ({
    padding: "0.6rem 1.5rem",
    borderRadius: "4px",
    border: `1px solid ${variant === "primary" ? COLORS.accent : COLORS.border}`,
    background: variant === "primary" ? COLORS.accentDim : "transparent",
    color: variant === "primary" ? COLORS.accent : COLORS.muted,
    cursor: "pointer",
    fontSize: "0.75rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    fontFamily: "inherit",
  }),
  badge: (type) => {
    const map = {
      ELIGIBLE: { bg: "#10b98122", color: COLORS.success, border: COLORS.success },
      NOT_ELIGIBLE: { bg: "#ef444422", color: COLORS.danger, border: COLORS.danger },
      CONDITIONAL: { bg: "#f59e0b22", color: COLORS.warn, border: COLORS.warn },
      High: { bg: "#ef444422", color: COLORS.danger, border: COLORS.danger },
      Moderate: { bg: "#f59e0b22", color: COLORS.warn, border: COLORS.warn },
      Low: { bg: "#10b98122", color: COLORS.success, border: COLORS.success },
      PASS: { bg: "#10b98122", color: COLORS.success, border: COLORS.success },
      FAIL: { bg: "#ef444422", color: COLORS.danger, border: COLORS.danger },
      SKIPPED: { bg: "#64748b22", color: COLORS.muted, border: COLORS.muted },
    };
    const s = map[type] || map["SKIPPED"];
    return {
      display: "inline-block",
      padding: "0.2rem 0.6rem",
      borderRadius: "3px",
      fontSize: "0.7rem",
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
    };
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" },
  sectionTitle: {
    fontSize: "0.7rem",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: COLORS.muted,
    marginBottom: "1rem",
    paddingBottom: "0.5rem",
    borderBottom: `1px solid ${COLORS.border}`,
  },
};

// ── GRAPH COMPONENT ───────────────────────────────────────────────────────────
function PolicyGraph({ nodes, edges }) {
  if (!nodes || nodes.length === 0) return null;

  const WIDTH = 700;
  const HEIGHT = 380;
  const CX = WIDTH / 2;
  const CY = 60;
  const RADIUS = 150;

  const nonRoot = nodes.filter((n) => n.id !== "policy_root");
  const positioned = nonRoot.map((n, i) => {
    const angle = (i / nonRoot.length) * 2 * Math.PI - Math.PI / 2;
    return { ...n, x: CX + RADIUS * Math.cos(angle), y: CY + 120 + RADIUS * Math.sin(angle) };
  });
  const root = { id: "policy_root", x: CX, y: CY, label: nodes.find((n) => n.id === "policy_root")?.label || "Policy" };
  const all = [root, ...positioned];
  const byId = Object.fromEntries(all.map((n) => [n.id, n]));

  const nodeColor = (type) => {
    if (type === "POLICY") return COLORS.policy;
    if (type === "DISQUALIFICATION") return COLORS.disqualification;
    return COLORS.eligibility;
  };

  return (
    <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ display: "block" }}>
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill={COLORS.muted} />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const s = byId[e.source];
        const t = byId[e.target];
        if (!s || !t) return null;
        const color = e.label === "EXCLUDES" ? COLORS.danger : COLORS.accent;
        return (
          <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
            stroke={color} strokeWidth="1" strokeOpacity="0.4" markerEnd="url(#arrow)" strokeDasharray={e.label === "EXCLUDES" ? "4,3" : "none"} />
        );
      })}
      {all.map((n) => {
        const color = nodeColor(n.type);
        const isRoot = n.id === "policy_root";
        const r = isRoot ? 28 : 22;
        const shortLabel = n.label?.replace("None None None", "EXCL").slice(0, 14);
        return (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={r} fill={color + "22"} stroke={color} strokeWidth={isRoot ? 2 : 1} />
            <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize={isRoot ? "9" : "8"} fill={color} fontFamily="DM Mono, monospace">
              {shortLabel}
            </text>
            {n.ambiguity_flag && (
              <circle cx={n.x + r - 4} cy={n.y - r + 4} r="5" fill={COLORS.warn} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── CLAUSE ITEM WITH COPY ─────────────────────────────────────────────────────
function ClauseItem({ clause: c }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(c.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ padding: "0.75rem", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>{c.text}</div>
        <div style={{ fontSize: "0.72rem", color: COLORS.muted }}>
          {c.variable && <span style={{ marginRight: "1rem" }}>var: <span style={{ color: COLORS.accent }}>{c.variable} {c.operator} {c.threshold_value}</span></span>}
          <span>confidence: {(c.confidence * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", alignItems: "flex-end" }}>
        <span style={style.badge(c.clause_type)}>{c.clause_type}</span>
        {c.ambiguity_flag && <span style={style.badge("SKIPPED")}>⚠ Ambiguous</span>}
        <button onClick={copy} style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: "3px", color: copied ? COLORS.success : COLORS.muted, fontSize: "0.65rem", cursor: "pointer", padding: "0.15rem 0.4rem", letterSpacing: "0.08em", fontFamily: "inherit" }}>
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
    </div>
  );
}

// ── PIPELINE PROGRESS ─────────────────────────────────────────────────────────
const PIPELINE_STEPS = [
  { key: "url", label: "Upload URL" },
  { key: "s3", label: "S3 Upload" },
  { key: "textract", label: "Textract OCR" },
  { key: "bedrock", label: "Bedrock Parse" },
  { key: "graph", label: "Graph Build" },
];

function PipelineProgress({ activeStep, done, error }) {
  if (!activeStep && !done) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0", margin: "1rem 0", flexWrap: "wrap" }}>
      {PIPELINE_STEPS.map((step, i) => {
        const stepIdx = PIPELINE_STEPS.findIndex((s) => s.key === activeStep);
        const isDone = done || i < stepIdx;
        const isActive = step.key === activeStep;
        const isError = error && isActive;
        const color = isError ? COLORS.danger : isDone ? COLORS.success : isActive ? COLORS.accent : COLORS.muted;
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
              <div style={{
                width: "10px", height: "10px", borderRadius: "50%",
                background: isDone || isActive ? color : "transparent",
                border: `1px solid ${color}`,
                boxShadow: isActive && !isError ? `0 0 8px ${color}` : "none",
                transition: "all 0.3s",
              }} />
              <span style={{ fontSize: "0.6rem", color, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{step.label}</span>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div style={{ width: "40px", height: "1px", background: i < stepIdx ? COLORS.success : COLORS.border, margin: "0 4px", marginBottom: "14px" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── UPLOAD + ANALYZE ──────────────────────────────────────────────────────────
function AnalyzePage({ onAnalyzed, analysisResult }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(null);
  const [pipelineDone, setPipelineDone] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === "application/pdf") setFile(dropped);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setPipelineDone(false);
    try {
      setActiveStep("url");
      const { data: urlData } = await axios.get(`${API}/upload-url`);

      setActiveStep("s3");
      await axios.put(urlData.upload_url, file, { headers: { "Content-Type": "application/pdf" } });

      setActiveStep("textract");
      await new Promise((r) => setTimeout(r, 1000));

      setActiveStep("bedrock");
      const { data: result } = await axios.post(`${API}/analyze`, { s3_key: urlData.s3_key });

      setActiveStep("graph");
      await new Promise((r) => setTimeout(r, 500));

      onAnalyzed(result);
      setPipelineDone(true);
      setActiveStep(null);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setActiveStep(null);
    } finally {
      setLoading(false);
    }
  }, [file, onAnalyzed]);

  const handleExport = () => {
    if (!analysisResult) return;
    const blob = new Blob([JSON.stringify(analysisResult, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `policygraph-${analysisResult.document_id || "result"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={style.card}>
        <div style={style.sectionTitle}>Upload Policy Document</div>

        {/* Drag & Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? COLORS.accent : file ? COLORS.success : COLORS.border}`,
            borderRadius: "8px",
            padding: "2rem",
            textAlign: "center",
            cursor: "pointer",
            background: dragging ? COLORS.accentDim : file ? "#10b98111" : COLORS.bg,
            transition: "all 0.2s",
            marginBottom: "1rem",
          }}
        >
          <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files[0])} />
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
            {file ? "✓" : "📄"}
          </div>
          <div style={{ fontSize: "0.85rem", color: file ? COLORS.success : COLORS.muted }}>
            {file ? file.name : "Drop a PDF here or click to browse"}
          </div>
          {file && (
            <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: "0.25rem" }}>
              {(file.size / 1024).toFixed(1)} KB
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <button style={style.btn()} onClick={handleAnalyze} disabled={!file || loading}>
            {loading ? "Processing..." : "Analyze Document"}
          </button>
          {analysisResult && !loading && (
            <button style={style.btn("secondary")} onClick={handleExport}>
              ↓ Export JSON
            </button>
          )}
          {error && <span style={{ fontSize: "0.8rem", color: COLORS.danger }}>{error}</span>}
        </div>

        <PipelineProgress activeStep={activeStep} done={pipelineDone} error={!!error} />
      </div>

      {analysisResult && (
        <>
          <div style={{ ...style.card }}>
            <div style={style.sectionTitle}>Analysis Results — {analysisResult.title}</div>
            <div style={style.grid2}>
              <div>
                <div style={style.label}>Clauses Extracted</div>
                <div style={{ fontSize: "2rem", color: COLORS.accent, fontWeight: "700" }}>{analysisResult.clauses_extracted}</div>
              </div>
              <div>
                <div style={style.label}>Complexity Score</div>
                <div style={{ fontSize: "2rem", fontWeight: "700", color: analysisResult.complexity_category === "High" ? COLORS.danger : analysisResult.complexity_category === "Moderate" ? COLORS.warn : COLORS.success }}>
                  {analysisResult.complexity_score}
                  <span style={{ fontSize: "1rem", marginLeft: "0.5rem" }}>
                    <span style={style.badge(analysisResult.complexity_category)}>{analysisResult.complexity_category}</span>
                  </span>
                </div>
              </div>
              <div>
                <div style={style.label}>Ambiguous Clauses</div>
                <div style={{ fontSize: "2rem", color: analysisResult.ambiguous_clauses > 0 ? COLORS.warn : COLORS.success, fontWeight: "700" }}>{analysisResult.ambiguous_clauses}</div>
              </div>
              <div>
                <div style={style.label}>Document ID</div>
                <div style={{ fontSize: "1rem", color: COLORS.muted, paddingTop: "0.5rem" }}>{analysisResult.document_id}</div>
              </div>
            </div>
          </div>

          <div style={style.card}>
            <div style={style.sectionTitle}>Policy Knowledge Graph</div>
            <PolicyGraph nodes={analysisResult.graph.nodes} edges={analysisResult.graph.edges} />
            <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem", fontSize: "0.72rem", color: COLORS.muted }}>
              <span><span style={{ color: COLORS.eligibility }}>●</span> Eligibility</span>
              <span><span style={{ color: COLORS.disqualification }}>●</span> Disqualification</span>
              <span><span style={{ color: COLORS.policy }}>●</span> Policy Root</span>
              <span><span style={{ color: COLORS.warn }}>●</span> Ambiguous</span>
            </div>
          </div>

          <div style={style.card}>
            <div style={style.sectionTitle}>Extracted Clauses</div>
            {analysisResult.clauses.map((c) => (
              <ClauseItem key={c.clause_id} clause={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── ELIGIBILITY CHECK ─────────────────────────────────────────────────────────
function EligibilityPage({ analysisResult }) {
  const [inputs, setInputs] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const variables = analysisResult
    ? [...new Set(analysisResult.clauses.filter((c) => c.variable).map((c) => c.variable))]
    : ["age", "income", "marks"];

  const handleCheck = async () => {
    if (!analysisResult) { setError("Please analyze a document first on the Analyze tab."); return; }
    setLoading(true); setError("");
    try {
      const { data } = await axios.post(`${API}/eligibility`, {
        clauses: analysisResult.clauses,
        user_inputs: inputs,
      });
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div style={style.card}>
        <div style={style.sectionTitle}>Citizen Eligibility Check</div>
        {!analysisResult && (
          <div style={{ color: COLORS.warn, fontSize: "0.85rem", marginBottom: "1rem" }}>
            ⚠ Please upload and analyze a policy document first.
          </div>
        )}
        <div style={style.grid2}>
          {variables.map((v) => (
            <div key={v}>
              <label style={style.label}>{v}</label>
              <input style={style.input} type="text" placeholder={`Enter ${v}`}
                value={inputs[v] || ""}
                onChange={(e) => setInputs({ ...inputs, [v]: e.target.value })} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
          <button style={style.btn()} onClick={handleCheck} disabled={loading}>
            {loading ? "Checking..." : "Check Eligibility"}
          </button>
          {error && <span style={{ color: COLORS.danger, fontSize: "0.8rem" }}>{error}</span>}
        </div>
      </div>

      {result && (
        <>
          <div style={{ ...style.card, borderColor: result.result === "ELIGIBLE" ? COLORS.success : result.result === "NOT_ELIGIBLE" ? COLORS.danger : COLORS.warn }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={style.label}>Eligibility Result</div>
                <div style={{ fontSize: "2.5rem", fontWeight: "700", color: result.result === "ELIGIBLE" ? COLORS.success : result.result === "NOT_ELIGIBLE" ? COLORS.danger : COLORS.warn }}>
                  {result.result === "ELIGIBLE" ? "✓ ELIGIBLE" : result.result === "NOT_ELIGIBLE" ? "✗ NOT ELIGIBLE" : "~ CONDITIONAL"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={style.label}>Confidence</div>
                <div style={{ fontSize: "2rem", color: COLORS.accent }}>{(result.confidence * 100).toFixed(0)}%</div>
              </div>
            </div>
            <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: COLORS.muted, borderTop: `1px solid ${COLORS.border}`, paddingTop: "0.75rem" }}>
              {result.passed} passed · {result.failed} failed · {result.skipped || 0} skipped
            </div>
          </div>

          <div style={style.card}>
            <div style={style.sectionTitle}>Reasoning Trace</div>
            {result.reasoning_trace.map((step) => (
              <div key={step.step} style={{ display: "flex", alignItems: "flex-start", gap: "1rem", padding: "0.75rem 0", borderBottom: `1px solid ${COLORS.border}` }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: step.outcome === "PASS" ? COLORS.success + "33" : step.outcome === "FAIL" ? COLORS.danger + "33" : COLORS.muted + "33", border: `1px solid ${step.outcome === "PASS" ? COLORS.success : step.outcome === "FAIL" ? COLORS.danger : COLORS.muted}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", color: step.outcome === "PASS" ? COLORS.success : step.outcome === "FAIL" ? COLORS.danger : COLORS.muted, flexShrink: 0 }}>
                  {step.step}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                    <span style={{ color: COLORS.accent }}>{step.condition}</span>
                    <span style={{ color: COLORS.muted, marginLeft: "0.75rem" }}>→ your value: <span style={{ color: COLORS.text }}>{String(step.user_value)}</span></span>
                  </div>
                  <div style={{ fontSize: "0.72rem", color: COLORS.muted }}>
                    Clause {step.clause_ref} · Confidence {(step.confidence * 100).toFixed(0)}%
                    {step.low_confidence_warning && <span style={{ color: COLORS.warn, marginLeft: "0.5rem" }}>⚠ Low confidence</span>}
                  </div>
                </div>
                <span style={style.badge(step.outcome)}>{step.outcome}</span>
              </div>
            ))}
            <div style={{ marginTop: "1rem", fontSize: "0.72rem", color: COLORS.muted, fontStyle: "italic" }}>{result.disclaimer}</div>
          </div>
        </>
      )}
    </div>
  );
}

// ── SCENARIO SIMULATION ───────────────────────────────────────────────────────
function ScenarioPage({ analysisResult }) {
  const [scenarios, setScenarios] = useState([
    { id: 1, label: "Scenario A", inputs: {}, result: null, loading: false, error: "" },
    { id: 2, label: "Scenario B", inputs: {}, result: null, loading: false, error: "" },
  ]);

  const variables = analysisResult
    ? [...new Set(analysisResult.clauses.filter((c) => c.variable).map((c) => c.variable))]
    : ["age", "income", "marks"];

  const updateInput = (scenarioId, variable, value) => {
    setScenarios((prev) => prev.map((s) => s.id === scenarioId ? { ...s, inputs: { ...s.inputs, [variable]: value } } : s));
  };

  const runScenario = async (scenarioId) => {
    if (!analysisResult) return;
    setScenarios((prev) => prev.map((s) => s.id === scenarioId ? { ...s, loading: true, error: "", result: null } : s));
    try {
      const scenario = scenarios.find((s) => s.id === scenarioId);
      const { data } = await axios.post(`${API}/eligibility`, {
        clauses: analysisResult.clauses,
        user_inputs: Object.fromEntries(Object.entries(scenario.inputs).map(([k, v]) => [k, parseFloat(v) || v])),
      });
      setScenarios((prev) => prev.map((s) => s.id === scenarioId ? { ...s, loading: false, result: data } : s));
    } catch (e) {
      setScenarios((prev) => prev.map((s) => s.id === scenarioId ? { ...s, loading: false, error: e.response?.data?.error || e.message } : s));
    }
  };

  const runAll = () => scenarios.forEach((s) => runScenario(s.id));

  const resultColor = (r) => r === "ELIGIBLE" ? COLORS.success : r === "NOT_ELIGIBLE" ? COLORS.danger : COLORS.warn;
  const resultIcon = (r) => r === "ELIGIBLE" ? "✓" : r === "NOT_ELIGIBLE" ? "✗" : "~";

  return (
    <div>
      {!analysisResult && (
        <div style={{ ...style.card, borderColor: COLORS.warn }}>
          <div style={{ color: COLORS.warn, fontSize: "0.85rem" }}>⚠ Please upload and analyze a policy document first.</div>
        </div>
      )}

      {/* Comparison Header */}
      {scenarios.every((s) => s.result) && (
        <div style={{ ...style.card, background: "#0d1220" }}>
          <div style={style.sectionTitle}>Scenario Comparison</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${scenarios.length}, 1fr)`, gap: "1rem" }}>
            {scenarios.map((s) => (
              <div key={s.id} style={{ padding: "1rem", background: COLORS.bg, borderRadius: "6px", border: `1px solid ${s.result ? resultColor(s.result.result) + "66" : COLORS.border}`, textAlign: "center" }}>
                <div style={{ fontSize: "0.7rem", color: COLORS.muted, marginBottom: "0.5rem", letterSpacing: "0.1em" }}>{s.label}</div>
                <div style={{ fontSize: "2rem", fontWeight: "700", color: resultColor(s.result.result) }}>
                  {resultIcon(s.result.result)} {s.result.result.replace("_", " ")}
                </div>
                <div style={{ fontSize: "1rem", color: COLORS.accent, marginTop: "0.25rem" }}>
                  {(s.result.confidence * 100).toFixed(0)}% confidence
                </div>
                <div style={{ fontSize: "0.72rem", color: COLORS.muted, marginTop: "0.5rem" }}>
                  {s.result.passed} passed · {s.result.failed} failed
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run All */}
      {analysisResult && (
        <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
          <button style={style.btn()} onClick={runAll}>
            ▶ Run All Scenarios
          </button>
          <span style={{ fontSize: "0.72rem", color: COLORS.muted }}>Fill in values below, then run all to compare side by side</span>
        </div>
      )}

      {/* Scenario Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
        {scenarios.map((scenario) => (
          <div key={scenario.id} style={style.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={style.sectionTitle}>{scenario.label}</div>
              {scenario.result && (
                <span style={style.badge(scenario.result.result === "ELIGIBLE" ? "ELIGIBLE" : scenario.result.result === "NOT_ELIGIBLE" ? "NOT_ELIGIBLE" : "CONDITIONAL")}>
                  {scenario.result.result.replace("_", " ")}
                </span>
              )}
            </div>

            {variables.map((v) => (
              <div key={v} style={{ marginBottom: "0.75rem" }}>
                <label style={style.label}>{v}</label>
                <input style={style.input} type="text" placeholder={`Enter ${v}`}
                  value={scenario.inputs[v] || ""}
                  onChange={(e) => updateInput(scenario.id, v, e.target.value)} />
              </div>
            ))}

            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "0.5rem" }}>
              <button style={style.btn()} onClick={() => runScenario(scenario.id)} disabled={scenario.loading || !analysisResult}>
                {scenario.loading ? "Running..." : "Run"}
              </button>
              {scenario.error && <span style={{ fontSize: "0.75rem", color: COLORS.danger }}>{scenario.error}</span>}
            </div>

            {/* Per-scenario reasoning trace */}
            {scenario.result?.reasoning_trace && (
              <div style={{ marginTop: "1rem", borderTop: `1px solid ${COLORS.border}`, paddingTop: "1rem" }}>
                <div style={{ fontSize: "0.65rem", color: COLORS.muted, letterSpacing: "0.1em", marginBottom: "0.5rem" }}>REASONING TRACE</div>
                {scenario.result.reasoning_trace.map((step) => (
                  <div key={step.step} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0", fontSize: "0.75rem" }}>
                    <span style={style.badge(step.outcome)}>{step.outcome}</span>
                    <span style={{ color: COLORS.muted, flex: 1 }}>{step.condition}</span>
                    <span style={{ color: COLORS.text }}>{String(step.user_value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


// ── TRANSPARENCY MODE ─────────────────────────────────────────────────────────
function TransparencyPage({ analysisResult }) {
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("ALL");

  if (!analysisResult) return (
    <div style={{ ...style.card, borderColor: COLORS.warn }}>
      <div style={{ color: COLORS.warn, fontSize: "0.85rem" }}>⚠ Please upload and analyze a policy document first.</div>
    </div>
  );

  const types = ["ALL", "ELIGIBILITY", "DISQUALIFICATION", "THRESHOLD", "CONDITION"];
  const filtered = analysisResult.clauses.filter((c) => filter === "ALL" || c.clause_type === filter);

  const logicMap = (c) => {
    if (c.variable && c.operator && c.threshold_value !== undefined)
      return `IF ${c.variable} ${c.operator} ${c.threshold_value} → ${c.clause_type}`;
    return `IF condition met → ${c.clause_type}`;
  };

  const confidenceBar = (val) => {
    const pct = ((val || 0) * 100).toFixed(0);
    const color = val >= 0.8 ? COLORS.success : val >= 0.5 ? COLORS.warn : COLORS.danger;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ flex: 1, height: "4px", background: COLORS.border, borderRadius: "2px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "2px" }} />
        </div>
        <span style={{ fontSize: "0.7rem", color, minWidth: "32px" }}>{pct}%</span>
      </div>
    );
  };

  return (
    <div>
      {/* Summary bar */}
      <div style={{ ...style.card, marginBottom: "1rem" }}>
        <div style={style.sectionTitle}>Transparency Mode — {analysisResult.title}</div>
        <div style={{ display: "flex", gap: "2rem", fontSize: "0.8rem", color: COLORS.muted }}>
          <span>Total clauses: <span style={{ color: COLORS.accent }}>{analysisResult.clauses.length}</span></span>
          <span>Ambiguous: <span style={{ color: COLORS.warn }}>{analysisResult.ambiguous_clauses}</span></span>
          <span>Complexity: <span style={{ color: COLORS.text }}>{analysisResult.complexity_score}/100 ({analysisResult.complexity_category})</span></span>
          <span>Document ID: <span style={{ color: COLORS.muted, fontSize: "0.72rem" }}>{analysisResult.document_id}</span></span>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {types.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            padding: "0.3rem 0.8rem", borderRadius: "4px", fontSize: "0.7rem",
            letterSpacing: "0.08em", cursor: "pointer", fontFamily: "inherit",
            border: `1px solid ${filter === t ? COLORS.accent : COLORS.border}`,
            background: filter === t ? COLORS.accentDim : "transparent",
            color: filter === t ? COLORS.accent : COLORS.muted,
          }}>{t}</button>
        ))}
      </div>

      {/* Two-column layout: list + detail */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "1.5rem", alignItems: "start" }}>

        {/* Clause list */}
        <div style={style.card}>
          <div style={{ fontSize: "0.65rem", color: COLORS.muted, letterSpacing: "0.12em", marginBottom: "0.75rem" }}>
            {filtered.length} CLAUSES
          </div>
          {filtered.map((c, i) => (
            <div key={c.clause_id} onClick={() => setSelected(c)}
              style={{
                padding: "0.6rem 0.75rem", borderRadius: "4px", cursor: "pointer",
                marginBottom: "0.4rem", transition: "all 0.15s",
                background: selected?.clause_id === c.clause_id ? COLORS.accentDim : "transparent",
                border: `1px solid ${selected?.clause_id === c.clause_id ? COLORS.accent : COLORS.border}`,
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.72rem", color: COLORS.muted }}>#{String(i + 1).padStart(2, "0")}</span>
                <span style={style.badge(c.clause_type)}>{c.clause_type}</span>
                {c.ambiguity_flag && <span style={{ color: COLORS.warn, fontSize: "0.72rem" }}>⚠</span>}
              </div>
              <div style={{ fontSize: "0.78rem", color: COLORS.text, marginTop: "0.3rem", lineHeight: "1.4",
                overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {c.text}
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div style={style.card}>
          {!selected ? (
            <div style={{ color: COLORS.muted, fontSize: "0.85rem", padding: "2rem 0", textAlign: "center" }}>
              ← Select a clause to inspect
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div style={style.sectionTitle}>Clause Detail</div>
                <span style={style.badge(selected.clause_type)}>{selected.clause_type}</span>
              </div>

              {/* Full text */}
              <div style={{ fontSize: "0.65rem", color: COLORS.muted, letterSpacing: "0.1em", marginBottom: "0.4rem" }}>ORIGINAL TEXT</div>
              <div style={{ fontSize: "0.85rem", lineHeight: "1.6", color: COLORS.text, padding: "0.75rem", background: COLORS.bg, borderRadius: "4px", border: `1px solid ${COLORS.border}`, marginBottom: "1rem" }}>
                {selected.text}
              </div>

              {/* Logical interpretation */}
              <div style={{ fontSize: "0.65rem", color: COLORS.muted, letterSpacing: "0.1em", marginBottom: "0.4rem" }}>LOGICAL INTERPRETATION</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.82rem", color: COLORS.accent, padding: "0.75rem", background: COLORS.bg, borderRadius: "4px", border: `1px solid ${COLORS.accent}33`, marginBottom: "1rem" }}>
                {logicMap(selected)}
              </div>

              {/* Variables */}
              {selected.variable && (
                <>
                  <div style={{ fontSize: "0.65rem", color: COLORS.muted, letterSpacing: "0.1em", marginBottom: "0.4rem" }}>EXTRACTED VARIABLES</div>
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                    <div style={{ padding: "0.4rem 0.75rem", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: "4px", fontSize: "0.75rem" }}>
                      <span style={{ color: COLORS.muted }}>variable: </span><span style={{ color: COLORS.accent }}>{selected.variable}</span>
                    </div>
                    <div style={{ padding: "0.4rem 0.75rem", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: "4px", fontSize: "0.75rem" }}>
                      <span style={{ color: COLORS.muted }}>operator: </span><span style={{ color: COLORS.text }}>{selected.operator}</span>
                    </div>
                    <div style={{ padding: "0.4rem 0.75rem", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: "4px", fontSize: "0.75rem" }}>
                      <span style={{ color: COLORS.muted }}>threshold: </span><span style={{ color: COLORS.warn }}>{selected.threshold_value}</span>
                    </div>
                  </div>
                </>
              )}

              {/* Confidence */}
              <div style={{ fontSize: "0.65rem", color: COLORS.muted, letterSpacing: "0.1em", marginBottom: "0.4rem" }}>AI CONFIDENCE</div>
              <div style={{ marginBottom: "1rem" }}>{confidenceBar(selected.confidence)}</div>

              {/* Flags */}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {selected.ambiguity_flag && (
                  <div style={{ padding: "0.4rem 0.75rem", background: "#f59e0b11", border: `1px solid ${COLORS.warn}`, borderRadius: "4px", fontSize: "0.72rem", color: COLORS.warn }}>
                    ⚠ Ambiguous — may need human review
                  </div>
                )}
                <div style={{ padding: "0.4rem 0.75rem", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: "4px", fontSize: "0.72rem", color: COLORS.muted }}>
                  ID: {selected.clause_id}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── GOVERNANCE DASHBOARD ──────────────────────────────────────────────────────
function GovernancePage({ analysisResult }) {
  const [docs, setDocs] = useState([]);
  const [conflicts, setConflicts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (analysisResult) {
      setDocs([{ title: analysisResult.title, clauses: analysisResult.clauses }]);
    }
  }, [analysisResult]);

  const detectConflicts = async () => {
    if (docs.length === 0) { setError("No documents loaded."); return; }
    setLoading(true); setError("");
    try {
      const { data } = await axios.post(`${API}/conflicts`, { documents: docs });
      setConflicts(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div style={style.card}>
        <div style={style.sectionTitle}>Governance Intelligence Dashboard</div>
        {!analysisResult ? (
          <div style={{ color: COLORS.warn, fontSize: "0.85rem" }}>⚠ Analyze a document first to see governance metrics.</div>
        ) : (
          <div style={style.grid2}>
            <div style={{ padding: "1rem", background: COLORS.bg, borderRadius: "6px", border: `1px solid ${COLORS.border}` }}>
              <div style={style.label}>Policy</div>
              <div style={{ fontSize: "1rem", color: COLORS.text, marginBottom: "0.5rem" }}>{analysisResult.title}</div>
              <span style={style.badge(analysisResult.complexity_category)}>{analysisResult.complexity_category} Complexity</span>
            </div>
            <div style={{ padding: "1rem", background: COLORS.bg, borderRadius: "6px", border: `1px solid ${COLORS.border}` }}>
              <div style={style.label}>Complexity Score</div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ fontSize: "2.5rem", fontWeight: "700", color: analysisResult.complexity_category === "High" ? COLORS.danger : COLORS.warn }}>
                  {analysisResult.complexity_score}
                </div>
                <div style={{ flex: 1, height: "8px", background: COLORS.border, borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${analysisResult.complexity_score}%`, background: analysisResult.complexity_category === "High" ? COLORS.danger : analysisResult.complexity_category === "Moderate" ? COLORS.warn : COLORS.success, borderRadius: "4px" }} />
                </div>
              </div>
            </div>
            <div style={{ padding: "1rem", background: COLORS.bg, borderRadius: "6px", border: `1px solid ${COLORS.border}` }}>
              <div style={style.label}>Clause Breakdown</div>
              <div style={{ fontSize: "0.85rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
                  <span style={{ color: COLORS.eligibility }}>Eligibility</span>
                  <span>{analysisResult.clauses.filter(c => c.clause_type === "ELIGIBILITY").length}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
                  <span style={{ color: COLORS.disqualification }}>Disqualification</span>
                  <span>{analysisResult.clauses.filter(c => c.clause_type === "DISQUALIFICATION").length}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0" }}>
                  <span style={{ color: COLORS.warn }}>Ambiguous</span>
                  <span>{analysisResult.ambiguous_clauses}</span>
                </div>
              </div>
            </div>
            <div style={{ padding: "1rem", background: COLORS.bg, borderRadius: "6px", border: `1px solid ${COLORS.border}` }}>
              <div style={style.label}>Neuro-Symbolic Pipeline</div>
              {["AWS Textract", "Amazon Bedrock (Claude 3 Haiku)", "Symbolic Backward Chaining", "NetworkX Graph Engine"].map((s, i) => (
                <div key={i} style={{ fontSize: "0.75rem", color: COLORS.muted, padding: "0.2rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ color: COLORS.accent }}>✓</span> {s}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={style.card}>
        <div style={style.sectionTitle}>Conflict Detection</div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
          <button style={style.btn()} onClick={detectConflicts} disabled={loading || !analysisResult}>
            {loading ? "Detecting..." : "Run Conflict Detection"}
          </button>
          {error && <span style={{ color: COLORS.danger, fontSize: "0.8rem" }}>{error}</span>}
        </div>

        {conflicts && (
          <>
            <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem" }}>
              <div style={{ padding: "0.75rem 1.25rem", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: "6px", textAlign: "center" }}>
                <div style={style.label}>Total</div>
                <div style={{ fontSize: "1.5rem", color: conflicts.total_conflicts > 0 ? COLORS.danger : COLORS.success }}>{conflicts.total_conflicts}</div>
              </div>
              {Object.entries(conflicts.severity_summary || {}).map(([sev, count]) => count > 0 && (
                <div key={sev} style={{ padding: "0.75rem 1.25rem", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: "6px", textAlign: "center" }}>
                  <div style={style.label}>{sev}</div>
                  <div style={{ fontSize: "1.5rem", color: sev === "HIGH" || sev === "CRITICAL" ? COLORS.danger : COLORS.warn }}>{count}</div>
                </div>
              ))}
            </div>

            {conflicts.conflicts.length === 0 ? (
              <div style={{ color: COLORS.success, fontSize: "0.85rem", padding: "1rem", background: "#10b98111", borderRadius: "6px", border: `1px solid ${COLORS.success}` }}>
                ✓ No conflicts detected in the loaded documents.
              </div>
            ) : (
              conflicts.conflicts.map((c) => (
                <div key={c.id} style={{ padding: "1rem", background: COLORS.bg, border: `1px solid ${COLORS.danger}44`, borderRadius: "6px", marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.85rem", color: COLORS.text }}>{c.description}</span>
                    <span style={style.badge(c.severity === "HIGH" ? "FAIL" : "SKIPPED")}>{c.severity}</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: COLORS.muted }}>
                    <span style={{ color: COLORS.accent }}>Clause A:</span> {c.clause_a?.text || c.clause_a?.ref} &nbsp;|&nbsp;
                    <span style={{ color: COLORS.danger }}>Clause B:</span> {c.clause_b?.text || c.clause_b?.ref}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── MULTILINGUAL SUPPORT ──────────────────────────────────────────────────────
const LANGUAGES = [
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ur", label: "Urdu", native: "اردو" },
];

function MultilingualPage({ analysisResult }) {
  const [selectedLang, setSelectedLang] = useState(null);
  const [translations, setTranslations] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [translatedTitle, setTranslatedTitle] = useState("");

  if (!analysisResult) return (
    <div style={{ ...style.card, borderColor: COLORS.warn }}>
      <div style={{ color: COLORS.warn, fontSize: "0.85rem" }}>⚠ Please upload and analyze a policy document first.</div>
    </div>
  );

  const translate = async (lang) => {
    if (translations[lang.code]) { setSelectedLang(lang); return; }
    setLoading(true); setError("");
    setSelectedLang(lang);
    try {
      const clauseTexts = analysisResult.clauses.map((c) => c.text);
      const prompt = `Translate the following policy clauses from English to ${lang.label}. 
Return ONLY a JSON array of translated strings in the same order, no explanation.
Clauses: ${JSON.stringify(clauseTexts)}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const raw = data.content?.[0]?.text || "[]";
      const clean = raw.replace(/```json|```/g, "").trim();
      const translated = JSON.parse(clean);

      // Translate title too
      const titleRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          messages: [{ role: "user", content: `Translate this policy title to ${lang.label}. Return only the translated title, nothing else: "${analysisResult.title}"` }],
        }),
      });
      const titleData = await titleRes.json();
      const translatedTitleText = titleData.content?.[0]?.text?.trim() || analysisResult.title;

      setTranslations((prev) => ({ ...prev, [lang.code]: translated }));
      setTranslatedTitle(translatedTitleText);
    } catch (e) {
      setError("Translation failed: " + e.message);
    } finally { setLoading(false); }
  };

  const current = selectedLang ? translations[selectedLang.code] : null;

  return (
    <div>
      <div style={style.card}>
        <div style={style.sectionTitle}>Multilingual Policy Support</div>
        <div style={{ fontSize: "0.8rem", color: COLORS.muted, marginBottom: "1.25rem" }}>
          Select a language to translate all extracted policy clauses. Powered by Amazon Bedrock.
        </div>

        {/* Language grid */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
          {LANGUAGES.map((lang) => {
            const isCached = !!translations[lang.code];
            const isActive = selectedLang?.code === lang.code;
            return (
              <button key={lang.code} onClick={() => translate(lang)}
                disabled={loading && !isActive}
                style={{
                  padding: "0.5rem 1rem", borderRadius: "6px", cursor: "pointer",
                  fontFamily: "inherit", fontSize: "0.78rem", transition: "all 0.2s",
                  border: `1px solid ${isActive ? COLORS.accent : isCached ? COLORS.success : COLORS.border}`,
                  background: isActive ? COLORS.accentDim : isCached ? "#10b98111" : "transparent",
                  color: isActive ? COLORS.accent : isCached ? COLORS.success : COLORS.muted,
                }}>
                <div style={{ fontWeight: "600" }}>{lang.native}</div>
                <div style={{ fontSize: "0.65rem", marginTop: "2px", opacity: 0.7 }}>
                  {isCached ? "✓ cached" : lang.label}
                </div>
              </button>
            );
          })}
        </div>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: COLORS.accent, fontSize: "0.82rem" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: COLORS.accent, animation: "pulse 1s infinite" }} />
            Translating to {selectedLang?.label} via Bedrock...
          </div>
        )}
        {error && <div style={{ color: COLORS.danger, fontSize: "0.8rem" }}>{error}</div>}
      </div>

      {/* Translated clauses */}
      {current && selectedLang && (
        <div style={style.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={style.sectionTitle}>{translatedTitle || analysisResult.title}</div>
            <span style={{ fontSize: "0.75rem", color: COLORS.accent, border: `1px solid ${COLORS.accent}44`, padding: "0.2rem 0.6rem", borderRadius: "4px" }}>
              {selectedLang.native} · {selectedLang.label}
            </span>
          </div>

          {analysisResult.clauses.map((c, i) => (
            <div key={c.clause_id} style={{ padding: "0.75rem", borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "0.65rem", color: COLORS.muted, letterSpacing: "0.08em" }}>CLAUSE {String(i + 1).padStart(2, "0")}</span>
                <span style={style.badge(c.clause_type)}>{c.clause_type}</span>
              </div>
              {/* Translated text */}
              <div style={{ fontSize: "0.88rem", lineHeight: "1.6", color: COLORS.text, marginBottom: "0.4rem" }}>
                {current[i] || "—"}
              </div>
              {/* Original text */}
              <div style={{ fontSize: "0.72rem", color: COLORS.muted, lineHeight: "1.5", borderTop: `1px solid ${COLORS.border}`, paddingTop: "0.4rem", marginTop: "0.4rem" }}>
                <span style={{ color: COLORS.muted, letterSpacing: "0.06em" }}>EN: </span>{c.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ROOT APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("analyze");
  const [analysisResult, setAnalysisResult] = useState(null);

  return (
    <div style={style.app}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <nav style={style.nav}>
        <div style={style.logo}>PolicyGraph <span style={{ color: COLORS.muted }}>AI</span> 2.0</div>
        <div style={style.tabs}>
          {[["analyze", "Analyze"], ["eligibility", "Citizen Check"], ["scenario", "Scenario Sim"], ["transparency", "Transparency"], ["multilingual", "Multilingual"], ["governance", "Governance"]].map(([key, label]) => (
            <button key={key} style={style.tab(tab === key)} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
        <div style={{ fontSize: "0.7rem", color: COLORS.muted }}>AWS · Bedrock · Textract</div>
      </nav>
      <main style={style.main}>
        {tab === "analyze" && <AnalyzePage onAnalyzed={setAnalysisResult} analysisResult={analysisResult} />}
        {tab === "eligibility" && <EligibilityPage analysisResult={analysisResult} />}
        {tab === "scenario" && <ScenarioPage analysisResult={analysisResult} />}
        {tab === "transparency" && <TransparencyPage analysisResult={analysisResult} />}
        {tab === "multilingual" && <MultilingualPage analysisResult={analysisResult} />}
        {tab === "governance" && <GovernancePage analysisResult={analysisResult} />}
      </main>
    </div>
  );
}
