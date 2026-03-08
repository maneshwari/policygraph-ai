# PolicyGraph AI 2.0

> Transforming government policy documents into explainable intelligence.

[![AWS](https://img.shields.io/badge/AWS-Bedrock%20%7C%20Textract%20%7C%20Lambda-orange)](https://aws.amazon.com)
[![Live API](https://img.shields.io/badge/API-Live%20on%20AWS-green)](https://m8dbfucuzj.execute-api.ap-south-1.amazonaws.com/prod)

## What It Does

PolicyGraph AI 2.0 is a **hybrid neuro-symbolic AI system** that transforms unstructured government policy PDFs into structured, explainable, machine-interpretable knowledge graphs.

**Citizen Intelligence Layer** — Citizens upload a policy PDF and check personal eligibility in seconds, with a full reasoning trace citing exact source clauses.

**Governance Intelligence Layer** — Policymakers get complexity scores, conflict detection across schemes, and ambiguity flags before implementation.

---

## Live Demo

**API Base URL:** `https://m8dbfucuzj.execute-api.ap-south-1.amazonaws.com/prod`

| Endpoint | Method | Description |
|---|---|---|
| `/upload-url` | GET | Get S3 presigned URL for PDF upload |
| `/analyze` | POST | Extract clauses, build graph, score complexity |
| `/eligibility` | POST | Backward chaining eligibility evaluation |
| `/conflicts` | POST | Cross-document conflict detection |

### Quick Test

```bash
# 1. Get upload URL
curl https://m8dbfucuzj.execute-api.ap-south-1.amazonaws.com/prod/upload-url

# 2. Upload PDF to S3 presigned URL
curl -X PUT "<upload_url>" -H "Content-Type: application/pdf" --data-binary @policy.pdf

# 3. Analyze
curl -X POST https://m8dbfucuzj.execute-api.ap-south-1.amazonaws.com/prod/analyze \
  -H "Content-Type: application/json" \
  -d '{"s3_key": "<s3_key_from_step_1>"}'

# 4. Check eligibility
curl -X POST https://m8dbfucuzj.execute-api.ap-south-1.amazonaws.com/prod/eligibility \
  -H "Content-Type: application/json" \
  -d '{"clauses": [...], "user_inputs": {"age": 21, "income": 450000, "marks": 85}}'
```

---

## AWS Architecture

```
User
 │
 ├─► GET /upload-url ──► Lambda ──► S3 Presigned URL
 │
 ├─► PUT PDF ──────────────────────► S3 Bucket (ap-south-1)
 │
 └─► POST /analyze
          │
          ├─► AWS Textract ── Extract text from PDF
          │
          ├─► Amazon Bedrock (Claude 3 Haiku)
          │       └─► Semantic clause extraction → JSON IR
          │
          ├─► Graph Constructor (NetworkX)
          │       └─► Policy knowledge graph (nodes + edges)
          │
          ├─► Complexity Scorer
          │       └─► 0-100 score, Low/Moderate/High category
          │
          └─► Conflict Detector
                  └─► Incompatible thresholds, direct contradictions

POST /eligibility
  └─► Symbolic Backward Chaining Engine
          └─► ELIGIBLE / NOT_ELIGIBLE / CONDITIONAL + Reasoning Trace

POST /conflicts
  └─► Cross-document conflict detection
          └─► Pairwise threshold comparison across schemes
```

**All services:** AWS ap-south-1 (Mumbai)  
**Deployment:** AWS SAM (Serverless Application Model)  
**IAM:** Least-privilege role (S3 + Textract + Bedrock only)

---

## Neuro-Symbolic Design

| Layer | Technology | Role |
|---|---|---|
| **Neural** | Amazon Bedrock (Claude 3 Haiku) | Extracts clauses, operators, thresholds from natural language |
| **Symbolic** | Python backward chaining | Deterministic eligibility evaluation — no black box |
| **Graph** | NetworkX in-memory | Policy knowledge graph with typed nodes and labeled edges |
| **API** | AWS Lambda + API Gateway | Serverless REST endpoints with CORS |

The neural layer feeds into the symbolic layer — Bedrock handles language understanding, Python handles logical reasoning. Every decision is auditable and cites exact source clauses.

---

## Project Structure

```
policygraph-ai/
├── .kiro/
│   └── specs/policygraph-ai-2.0/
│       ├── requirements.md       # 15 functional requirements
│       ├── design.md             # Full system design
│       └── .config.kiro
├── backend/
│   ├── template.yaml             # AWS SAM template
│   ├── deploy.sh                 # One-command deploy
│   └── functions/
│       ├── analyze/              # S3→Textract→Bedrock→Graph
│       ├── eligibility/          # Backward chaining engine
│       ├── conflicts/            # Cross-doc conflict detection
│       └── upload_url/           # S3 presigned URL generator
├── frontend/
│   └── src/
│       └── App.js                # React app (3 tabs, wired to API)
└── README.md
```

---

## Local Setup

### Prerequisites
- AWS CLI configured (`aws configure`)
- AWS SAM CLI (`brew install aws-sam-cli`)
- Python 3.11
- Node.js 18+
- Amazon Bedrock access for `anthropic.claude-3-haiku-20240307-v1:0` in ap-south-1

### Deploy Backend

```bash
cd backend
chmod +x deploy.sh
./deploy.sh
```

Takes ~3 minutes. Outputs your API URL and S3 bucket name.

### Run Frontend

```bash
cd frontend
npm install
npm start
```

Update `API` constant in `src/App.js` with your deployed API URL.

---

## Sample API Response

```json
{
  "document_id": "3a4204e9",
  "title": "PM Scholarship Scheme 2024",
  "clauses_extracted": 6,
  "complexity_score": 28,
  "complexity_category": "Low",
  "ambiguous_clauses": 0,
  "clauses": [
    {
      "clause_id": "c001",
      "text": "The applicant must be at least 18 years of age",
      "clause_type": "ELIGIBILITY",
      "variable": "age",
      "operator": "GTE",
      "threshold_value": "18",
      "confidence": 0.95,
      "ambiguity_flag": false
    }
  ],
  "graph": {
    "nodes": [...],
    "edges": [...]
  },
  "disclaimer": "Advisory only. Not legally binding."
}
```

---

## Key Design Decisions

**Why Bedrock instead of a fine-tuned BERT?**  
For the MVP, Claude 3 Haiku via Bedrock gives us production-quality clause extraction in a single API call with zero infra. The output schema is deterministic JSON — the neural layer is modular and swappable without changing the reasoning engine.

**Why backward chaining instead of a rule engine like Drools?**  
Drools adds significant complexity for the MVP scope (3-5 docs, ~100 clauses). Our custom backward chaining in Python is 80 lines, fully transparent, and handles the O(50) complexity of typical policy graphs within the 5-second SLA.

**Why NetworkX instead of Neo4j?**  
Neo4j requires a separate server. NetworkX is in-memory, zero infra, and sufficient for MVP corpus. The interface contract (nodes + edges JSON) is identical — swap to Neo4j in Phase 2 without changing any other component.

---

## Responsible AI

- All outputs labeled **advisory only, not legally binding**
- No personal user data stored beyond session (in-memory only)
- Confidence scores surfaced on every extraction and reasoning step
- Ambiguity flags shown when language is vague or uncertain
- Low-confidence warning shown when confidence < 0.6

---

## Team

Built at Hackathon 2026 — PolicyGraph Team  
Region: AWS ap-south-1 (Mumbai)
