-- ================================================================
-- FORGE KNOWLEDGE ENGINE — PostgreSQL Schema
-- Version: 1.0 | Date: 2026-05-19
-- Xencore Global GmbH · Confidential
-- ================================================================

-- ── ENUMS ────────────────────────────────────────────────────────

CREATE TYPE knowledge_source AS ENUM (
  'manual',           -- Level 1: human-written
  'forge-synthesis',  -- Level 2: derived from Forge Best-of-Best
  'hybrid'            -- Level 2: synthesis + human editing
);

CREATE TYPE knowledge_status AS ENUM (
  'draft',            -- Awaiting approval
  'active',           -- Live and injecting
  'deprecated'        -- Superseded — kept for audit
);

CREATE TYPE knowledge_confidence AS ENUM (
  'low', 'medium', 'high'
);

CREATE TYPE candidate_status AS ENUM (
  'pending',          -- Awaiting human review
  'approved',         -- Approved — promoted to knowledge_modules
  'rejected'          -- Rejected — kept for audit
);


-- ── TABLE 1: CORE MODULE REGISTRY ────────────────────────────────
-- Supports: Level 1 (static) + Level 2 (synthesis-derived)

CREATE TABLE knowledge_modules (

  -- Identity
  id                    SERIAL PRIMARY KEY,
  module_id             VARCHAR(20) NOT NULL UNIQUE,  -- e.g. 'FKM-001'
  name                  VARCHAR(200) NOT NULL,
  version               VARCHAR(10) NOT NULL DEFAULT '1.0',

  -- Classification
  source                knowledge_source NOT NULL,
  status                knowledge_status NOT NULL DEFAULT 'draft',
  confidence            knowledge_confidence NOT NULL DEFAULT 'medium',

  -- Content
  summary               TEXT NOT NULL,               -- One-sentence bottom line
  content_markdown      TEXT NOT NULL,               -- Full module content
  system_prompt_snippet TEXT NOT NULL,               -- Condensed injection text

  -- Forge synthesis metadata (Level 2)
  forge_consensus       INTEGER CHECK (forge_consensus BETWEEN 0 AND 100),
  source_synthesis_id   VARCHAR(100),               -- ID of originating synthesis

  -- Provenance
  approved_by           VARCHAR(100),               -- Human reviewer
  supersedes_id         INTEGER REFERENCES knowledge_modules(id),

  -- Timestamps
  review_due_at         TIMESTAMP,                  -- Quarterly by default
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_km_status     ON knowledge_modules(status);
CREATE INDEX idx_km_review_due ON knowledge_modules(review_due_at);
CREATE INDEX idx_km_module_id  ON knowledge_modules(module_id);


-- ── TABLE 2: KEYWORD ROUTING ──────────────────────────────────────
-- Determines which module to inject for a given query

CREATE TABLE knowledge_keywords (
  id          SERIAL PRIMARY KEY,
  module_id   INTEGER NOT NULL REFERENCES knowledge_modules(id) ON DELETE CASCADE,
  keyword     VARCHAR(100) NOT NULL,
  weight      FLOAT NOT NULL DEFAULT 1.0,   -- Higher = stronger match signal
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kk_module  ON knowledge_keywords(module_id);
CREATE INDEX idx_kk_keyword ON knowledge_keywords(keyword);


-- ── TABLE 3: DOMAIN TAGS ──────────────────────────────────────────
-- Secondary routing by domain category

CREATE TABLE knowledge_domains (
  id          SERIAL PRIMARY KEY,
  module_id   INTEGER NOT NULL REFERENCES knowledge_modules(id) ON DELETE CASCADE,
  domain      VARCHAR(100) NOT NULL,        -- e.g. 'ai-technology', 'excel-intelligence'
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(module_id, domain)
);

CREATE INDEX idx_kd_domain ON knowledge_domains(domain);


-- ── TABLE 4: VERSION HISTORY ──────────────────────────────────────
-- Full audit trail of every change to every module

CREATE TABLE knowledge_versions (
  id                    SERIAL PRIMARY KEY,
  module_id             INTEGER NOT NULL REFERENCES knowledge_modules(id) ON DELETE CASCADE,
  version               VARCHAR(10) NOT NULL,
  content_markdown      TEXT NOT NULL,
  system_prompt_snippet TEXT NOT NULL,
  changed_by            VARCHAR(100) NOT NULL,
  change_summary        TEXT,                        -- What changed and why
  created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kv_module ON knowledge_versions(module_id);


-- ── TABLE 5: CANDIDATE PIPELINE ──────────────────────────────────
-- Level 2: Synthesis outputs awaiting human review for ingestion

CREATE TABLE knowledge_candidates (
  id                    SERIAL PRIMARY KEY,

  -- Source
  source_synthesis_id   VARCHAR(100),               -- Forge synthesis that generated this
  forge_consensus       INTEGER CHECK (forge_consensus BETWEEN 0 AND 100),

  -- Proposed module content
  proposed_module_id    VARCHAR(20),                -- e.g. 'FKM-006'
  proposed_name         VARCHAR(200),
  proposed_domain       VARCHAR(100),
  content_markdown      TEXT NOT NULL,
  system_prompt_snippet TEXT,

  -- Review
  status                candidate_status NOT NULL DEFAULT 'pending',
  reviewed_by           VARCHAR(100),
  review_notes          TEXT,
  promoted_to_module_id INTEGER REFERENCES knowledge_modules(id),

  -- Timestamps
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_at           TIMESTAMP
);

CREATE INDEX idx_kc_status ON knowledge_candidates(status);


-- ── TABLE 6: INJECTION LOG ────────────────────────────────────────
-- Level 3: Every time a module is injected into a query

CREATE TABLE knowledge_injections (
  id                  SERIAL PRIMARY KEY,
  module_id           INTEGER NOT NULL REFERENCES knowledge_modules(id),
  query_domain        VARCHAR(100),                -- Detected domain of the query
  matched_keyword     VARCHAR(100),                -- Keyword that triggered injection
  synthesis_consensus INTEGER,                     -- Consensus score of resulting synthesis
  quality_rating      INTEGER CHECK (quality_rating BETWEEN 1 AND 5),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ki_module ON knowledge_injections(module_id);
CREATE INDEX idx_ki_date   ON knowledge_injections(created_at);


-- ── TABLE 7: QUALITY METRICS ──────────────────────────────────────
-- Level 3 & 4: Measures whether each module improves synthesis quality

CREATE TABLE knowledge_quality (
  id                      SERIAL PRIMARY KEY,
  module_id               INTEGER NOT NULL REFERENCES knowledge_modules(id),
  period_start            DATE NOT NULL,
  period_end              DATE NOT NULL,
  injection_count         INTEGER NOT NULL DEFAULT 0,
  avg_consensus_with      FLOAT,    -- Avg synthesis consensus when module injected
  avg_consensus_without   FLOAT,    -- Baseline (A/B: same domain, no injection)
  quality_delta           FLOAT,    -- avg_with - avg_without (positive = module helps)
  created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(module_id, period_start)
);


-- ── TABLE 8: MODULE RELATIONS ─────────────────────────────────────
-- Links between related, prerequisite, or contradicting modules

CREATE TABLE knowledge_relations (
  id                SERIAL PRIMARY KEY,
  module_id         INTEGER NOT NULL REFERENCES knowledge_modules(id) ON DELETE CASCADE,
  related_module_id INTEGER NOT NULL REFERENCES knowledge_modules(id) ON DELETE CASCADE,
  relation_type     VARCHAR(50) NOT NULL,  -- 'related' | 'prerequisite' | 'contradicts'
  CHECK (module_id != related_module_id),
  UNIQUE(module_id, related_module_id)
);


-- ── TRIGGER: AUTO-UPDATE updated_at ──────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_km_updated_at
BEFORE UPDATE ON knowledge_modules
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- FORGE KNOWLEDGE ENGINE — Seed Data
-- Five foundation modules · Version 1.0 · 2026-05-19
-- ================================================================

INSERT INTO knowledge_modules (
  module_id, name, version, source, status, confidence,
  forge_consensus, approved_by, review_due_at,
  summary, system_prompt_snippet, content_markdown
) VALUES

('FKM-001', 'AI Chatbot Technology', '1.0',
  'forge-synthesis', 'active', 'high',
  91, 'Daniel Jones', NOW() + INTERVAL '90 days',
  'All major chatbots use Transformer-based LLMs. Differences stem from training data, fine-tuning, and safety alignment — not architecture.',
  'CONTEXT: All major AI models (ChatGPT, Claude, Gemini, DeepSeek, Grok, Perplexity, Mistral) share the same Transformer/LLM architecture. For current-events queries weight Gemini/Grok/Perplexity higher. For long documents weight Claude higher. For technical queries weight Claude/ChatGPT/DeepSeek higher. For EU/privacy weight Mistral.',
  '[Full markdown content from forge-knowledge-engine.html FKM-001 section]'),

('FKM-002', 'Decision Frameworks', '1.0',
  'manual', 'active', 'high',
  NULL, 'Daniel Jones', NOW() + INTERVAL '90 days',
  'The right framework depends on information availability, reversibility, and time pressure. High consensus = verify shared assumption. Low consensus = read the outlier.',
  'CONTEXT: When helping with decisions — use second-order thinking for cascading consequences, inversion/pre-mortem for high-risk decisions, OODA for time-critical situations. High consensus across AIs validates an answer but does not guarantee it. Low consensus signals genuine controversy — surface all perspectives.',
  '[Full markdown content from forge-knowledge-engine.html FKM-002 section]'),

('FKM-003', 'Data and Spreadsheet Quality', '1.0',
  'manual', 'active', 'high',
  NULL, 'Daniel Jones', NOW() + INTERVAL '90 days',
  'Most spreadsheet errors fall into six categories. Magnitude errors and cascade errors are most dangerous. Domain context transforms anomaly detection from generic to precise.',
  'CONTEXT: For Excel/CSV analysis — flag magnitude anomalies (never delete without investigation), cascade errors (all downstream values suspect), duplicate records (confirm deduplication rule), date format inconsistencies (flag ambiguous dates), and missing values above 10% (flag impact on analysis reliability).',
  '[Full markdown content from forge-knowledge-engine.html FKM-003 section]'),

('FKM-004', 'AI Limitations and Failure Modes', '1.0',
  'manual', 'active', 'high',
  NULL, 'Daniel Jones', NOW() + INTERVAL '90 days',
  'All AI models can hallucinate, have knowledge cutoffs, exhibit sycophancy, and reflect training bias. Forge multi-model consensus reduces but does not eliminate these risks.',
  'CONTEXT: AI failure modes — hallucination (cross-model consensus reduces risk), knowledge cutoff (weight live-data models for time-sensitive queries), sycophancy (Devil''s Advocate mode counteracts), overconfidence (consensus score makes uncertainty visible), training bias (8 different training sets rarely align on same bias). Always recommend verification for high-stakes decisions.',
  '[Full markdown content from forge-knowledge-engine.html FKM-004 section]'),

('FKM-005', 'Swiss Business and SaaS Context', '1.0',
  'manual', 'active', 'high',
  NULL, 'Daniel Jones', NOW() + INTERVAL '90 days',
  'Forge operates under Swiss FADP (aligned with GDPR), Xencore Global GmbH as data controller, AI outputs disclaimed as non-professional advice. VAT obligations grow with revenue.',
  'CONTEXT: Forge is operated by Xencore Global GmbH, Zürich, Switzerland. Swiss FADP compliant. Analysis content not retained after session. AI outputs are not professional advice — always recommend verification with qualified professionals for legal, financial, and medical queries. For privacy-sensitive enterprise queries recommend including Mistral (GDPR-native provider).',
  '[Full markdown content from forge-knowledge-engine.html FKM-005 section]');


-- ── KEYWORDS for FKM-001 ─────────────────────────────────────────
INSERT INTO knowledge_keywords (module_id, keyword, weight)
SELECT id, kw, w FROM knowledge_modules,
UNNEST(ARRAY[
  ROW('chatgpt',1.5), ROW('claude',1.5), ROW('gemini',1.5),
  ROW('deepseek',1.2), ROW('grok',1.2), ROW('perplexity',1.2),
  ROW('mistral',1.2), ROW('llm',1.0), ROW('which ai',1.3),
  ROW('best ai',1.3), ROW('transformer',1.0),
  ROW('language model',1.0), ROW('ai model',1.1)
]) AS t(kw TEXT, w FLOAT)
WHERE module_id = 'FKM-001';

-- ── KEYWORDS for FKM-002 ─────────────────────────────────────────
INSERT INTO knowledge_keywords (module_id, keyword, weight)
SELECT id, kw, w FROM knowledge_modules,
UNNEST(ARRAY[
  ROW('decision',1.5), ROW('decide',1.5), ROW('should i',1.4),
  ROW('risk',1.2), ROW('framework',1.2), ROW('choose',1.3),
  ROW('option',1.1), ROW('pros and cons',1.4),
  ROW('trade-off',1.3), ROW('best option',1.4)
]) AS t(kw TEXT, w FLOAT)
WHERE module_id = 'FKM-002';

-- ── KEYWORDS for FKM-003 ─────────────────────────────────────────
INSERT INTO knowledge_keywords (module_id, keyword, weight)
SELECT id, kw, w FROM knowledge_modules,
UNNEST(ARRAY[
  ROW('excel',1.5), ROW('csv',1.5), ROW('spreadsheet',1.5),
  ROW('data error',1.4), ROW('duplicate',1.3),
  ROW('anomaly',1.3), ROW('outlier',1.2),
  ROW('missing data',1.3), ROW('data quality',1.4)
]) AS t(kw TEXT, w FLOAT)
WHERE module_id = 'FKM-003';

-- ── KEYWORDS for FKM-004 ─────────────────────────────────────────
INSERT INTO knowledge_keywords (module_id, keyword, weight)
SELECT id, kw, w FROM knowledge_modules,
UNNEST(ARRAY[
  ROW('hallucinate',1.5), ROW('accurate',1.3),
  ROW('reliable',1.3), ROW('verify',1.3),
  ROW('trust',1.2), ROW('wrong',1.2),
  ROW('bias',1.3), ROW('mistake',1.2),
  ROW('knowledge cutoff',1.4), ROW('outdated',1.3)
]) AS t(kw TEXT, w FLOAT)
WHERE module_id = 'FKM-004';

-- ── KEYWORDS for FKM-005 ─────────────────────────────────────────
INSERT INTO knowledge_keywords (module_id, keyword, weight)
SELECT id, kw, w FROM knowledge_modules,
UNNEST(ARRAY[
  ROW('privacy',1.5), ROW('gdpr',1.5), ROW('fadp',1.5),
  ROW('switzerland',1.4), ROW('swiss',1.4),
  ROW('legal',1.3), ROW('data protection',1.4),
  ROW('vat',1.2), ROW('compliance',1.3),
  ROW('xencore',1.5), ROW('forge data',1.4)
]) AS t(kw TEXT, w FLOAT)
WHERE module_id = 'FKM-005';

-- ── RELATIONS ─────────────────────────────────────────────────────
INSERT INTO knowledge_relations (module_id, related_module_id, relation_type)
SELECT a.id, b.id, 'related'
FROM knowledge_modules a, knowledge_modules b
WHERE (a.module_id, b.module_id) IN (
  ('FKM-001', 'FKM-004'),  -- AI Technology ↔ AI Limitations
  ('FKM-002', 'FKM-004'),  -- Decision Frameworks ↔ AI Limitations
  ('FKM-003', 'FKM-001')   -- Data Quality ↔ AI Technology
);

-- Called before synthesis with the user's query text ($1)
-- Returns the top matching active modules ordered by match strength
-- The backend prepends system_prompt_snippet to the synthesis prompt

SELECT DISTINCT ON (km.id)
  km.module_id,
  km.name,
  km.system_prompt_snippet,
  km.confidence,
  SUM(kk.weight) AS match_score

FROM   knowledge_modules km
JOIN   knowledge_keywords kk ON kk.module_id = km.id

WHERE  km.status = 'active'
  AND  LOWER($1) LIKE '%' || LOWER(kk.keyword) || '%'

GROUP BY km.id, km.module_id, km.name,
         km.system_prompt_snippet, km.confidence

ORDER BY km.id, match_score DESC
LIMIT 3;  -- Inject at most 3 modules per query to keep prompt concise

-- Called from the Command Center when admin flags a synthesis for review

INSERT INTO knowledge_candidates (
  source_synthesis_id, forge_consensus,
  proposed_module_id, proposed_name,
  proposed_domain, content_markdown,
  system_prompt_snippet
) VALUES (
  $1,  -- synthesis_id from Forge synthesis table
  $2,  -- consensus % from that synthesis
  $3,  -- next FKM-xxx ID
  $4,  -- human-provided module name
  $5,  -- domain tag
  $6,  -- full synthesis content (markdown)
  $7   -- condensed system prompt snippet
)
RETURNING id;

-- Runs in a transaction: update candidate + insert new module

BEGIN;

  -- 1. Mark candidate as approved
  UPDATE knowledge_candidates
  SET
    status      = 'approved',
    reviewed_by = $2,         -- admin user name
    review_notes = $3,
    reviewed_at = NOW()
  WHERE id = $1;

  -- 2. Insert as active module
  WITH candidate AS (
    SELECT * FROM knowledge_candidates WHERE id = $1
  )
  INSERT INTO knowledge_modules (
    module_id, name, source, status, confidence,
    forge_consensus, source_synthesis_id,
    approved_by, review_due_at,
    summary, content_markdown, system_prompt_snippet
  )
  SELECT
    c.proposed_module_id, c.proposed_name,
    'forge-synthesis', 'active',
    CASE WHEN c.forge_consensus >= 85 THEN 'high'
         WHEN c.forge_consensus >= 65 THEN 'medium'
         ELSE 'low' END,
    c.forge_consensus, c.source_synthesis_id,
    $2, NOW() + INTERVAL '90 days',
    LEFT(c.content_markdown, 200),  -- auto-summary from first 200 chars
    c.content_markdown, c.system_prompt_snippet
  FROM candidate c
  RETURNING id;

  -- 3. Update candidate with promoted module id
  UPDATE knowledge_candidates
  SET promoted_to_module_id = (SELECT MAX(id) FROM knowledge_modules)
  WHERE id = $1;

COMMIT;

-- Create a view for the Command Center Knowledge Engine panel

CREATE OR REPLACE VIEW v_knowledge_dashboard AS
SELECT
  km.module_id,
  km.name,
  km.version,
  km.status,
  km.confidence,
  km.source,
  km.forge_consensus,
  km.approved_by,
  km.review_due_at,
  km.updated_at,
  ARRAY_AGG(DISTINCT kd.domain)   AS domains,
  ARRAY_AGG(DISTINCT kk.keyword) AS keywords,
  COUNT(DISTINCT ki.id)           AS injection_count,
  AVG(ki.synthesis_consensus)     AS avg_consensus,
  km.review_due_at NOW()         AS review_overdue

FROM        knowledge_modules   km
LEFT JOIN   knowledge_domains   kd ON kd.module_id = km.id
LEFT JOIN   knowledge_keywords  kk ON kk.module_id = km.id
LEFT JOIN   knowledge_injections ki ON ki.module_id = km.id

GROUP BY    km.id
ORDER BY    km.module_id;

-- Usage: SELECT * FROM v_knowledge_dashboard WHERE status = 'active';

-- Pending candidates summary
CREATE OR REPLACE VIEW v_knowledge_candidates_pending AS
SELECT
  id, proposed_module_id, proposed_name,
  proposed_domain, forge_consensus, status,
  LEFT(content_markdown, 300) AS preview,
  created_at
FROM  knowledge_candidates
WHERE status = 'pending'
ORDER BY forge_consensus DESC, created_at DESC;

-- Returns modules whose review date has passed
-- Send these to the Command Center as alerts

SELECT
  km.module_id,
  km.name,
  km.review_due_at,
  NOW() - km.review_due_at AS overdue_by,
  km.approved_by

FROM  knowledge_modules km
WHERE km.status = 'active'
  AND km.review_due_at NOW()
ORDER BY km.review_due_at ASC;