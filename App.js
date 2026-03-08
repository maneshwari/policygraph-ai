import { useState, useCallback, useEffect } from "react";
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

// ── UPLOAD + ANALYZE ──────────────────────────────────────────────────────────
function AnalyzePage({ onAnalyzed, analysisResult }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      setStatus("Getting upload URL...");
      const { data: urlData } = await axios.get(`${API}/upload-url`);

      setStatus("Uploading PDF to S3...");
      await axios.put(urlData.upload_url, file, { headers: { "Content-Type": "application/pdf" } });

      setStatus("Extracting text with AWS Textract...");
      await new Promise((r) => setTimeout(r, 1000));

      setStatus("Parsing clauses with Amazon Bedrock (Claude)...");
      const { data: result } = await axios.post(`${API}/analyze`, { s3_key: urlData.s3_key });

      setStatus("Building policy graph...");
      await new Promise((r) => setTimeout(r, 500));

      onAnalyzed(result);
      setStatus("Analysis complete.");
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setStatus("");
    } finally {
      setLoading(false);
    }
  }, [file, onAnalyzed]);

  return (
    <div>
      <div style={style.card}>
        <div style={style.sectionTitle}>Upload Policy Document</div>
        <label style={style.label}>Select PDF</label>
        <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files[0])}
          style={{ ...style.input, padding: "0.5rem" }} />
        <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <button style={style.btn()} onClick={handleAnalyze} disabled={!file || loading}>
            {loading ? "Processing..." : "Analyze Document"}
          </button>
          {status && <span style={{ fontSize: "0.8rem", color: COLORS.accent }}>{status}</span>}
          {error && <span style={{ fontSize: "0.8rem", color: COLORS.danger }}>{error}</span>}
        </div>
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
              <div key={c.clause_id} style={{ padding: "0.75rem", borderBottom: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
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
                </div>
              </div>
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
          {[["analyze", "Analyze"], ["eligibility", "Citizen Check"], ["governance", "Governance"]].map(([key, label]) => (
            <button key={key} style={style.tab(tab === key)} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
        <div style={{ fontSize: "0.7rem", color: COLORS.muted }}>AWS · Bedrock · Textract</div>
      </nav>
      <main style={style.main}>
        {tab === "analyze" && <AnalyzePage onAnalyzed={setAnalysisResult} analysisResult={analysisResult} />}
        {tab === "eligibility" && <EligibilityPage analysisResult={analysisResult} />}
        {tab === "governance" && <GovernancePage analysisResult={analysisResult} />}
      </main>
    </div>
  );
}
