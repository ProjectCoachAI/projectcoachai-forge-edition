/**
 * AI Response Synthesis Engine
 * Generates 7 different types of analysis from compared AI responses
 */

// Global state
let comparisonData = null;
let synthesisResults = {};
let selectedModes = []; // Start with no modes selected - user must explicitly select
let isFocusedSynthesis = false;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setupSynthesis();
    // Force 2-row layout for modes-grid
    enforceModesGridLayout();
    // Sync visual selection state with selectedModes array
    syncVisualSelectionState();
    // Update button text to reflect selected count
    updateSynthesisButtonText();
});

// Force 2-row layout (4 items in first row, 3 in second)
function enforceModesGridLayout() {
    const modesGrid = document.querySelector('.modes-grid');
    if (modesGrid) {
        modesGrid.style.setProperty('display', 'grid', 'important');
        modesGrid.style.setProperty('grid-template-columns', 'repeat(4, 1fr)', 'important');
        modesGrid.style.setProperty('gap', '20px', 'important');
        console.log('[Layout] Enforced 2-row layout on modes-grid');
    }
}

// Setup synthesis page with comparison data
function setupSynthesis() {
    // Listen for setup data from main process
    if (window.electronAPI && window.electronAPI.on) {
        window.electronAPI.on('setup-synthesis', (data) => {
            console.log('✨ [Synthesis] Received setup data:', data);
            comparisonData = data;
            if (data?.focusedMode) {
                handleFocusedSynthesisData(data);
            }
            updateDataStatus(data);
        });
    }
    
    // Fallback: try to get data from localStorage or URL params
    setTimeout(() => {
        if (!comparisonData && !isFocusedSynthesis) {
            // Try to get from localStorage (if passed from comparison view)
            const stored = localStorage.getItem('comparisonData');
            if (stored) {
                try {
                    comparisonData = JSON.parse(stored);
                    updateDataStatus(comparisonData);
                } catch (e) {
                    console.error('Failed to parse stored data:', e);
                }
            }
        }
    }, 500);
}

function handleFocusedSynthesisData(data) {
    isFocusedSynthesis = true;
    document.body.classList.add('focused-synthesis-mode');
    console.log('✨ [Synthesis] Focused synthesis payload detected:', data);
    const banner = document.getElementById('focusedModeBanner');
    if (banner) {
        banner.style.display = 'flex';
        const bannerText = banner.querySelector('.focused-mode-text');
        if (bannerText) {
            bannerText.textContent = data.prompt
                ? `Forge • ${data.prompt}`
                : 'Forge • Generating report';
        }
    }
    selectedModes = Array.isArray(data.initialModes) && data.initialModes.length
        ? [...data.initialModes]
        : ['bestof'];
    updateSynthesisButtonText();

    // Hide unnecessary UI
    const modesSection = document.querySelector('.synthesis-modes');
    if (modesSection) modesSection.style.display = 'none';
    const actions = document.querySelector('.synthesis-actions');
    if (actions) actions.classList.add('focused-mode-actions');

    // Run synthesis automatically
    setTimeout(() => {
        runSynthesis().catch(error => {
            console.error('❌ [Focused Synthesis] Auto-run failed:', error);
        });
    }, 50);
}

// Update data status display
function updateDataStatus(data) {
    const panes = data.panes || [];
    // Filter to only show panes with actual responses
    const panesWithResponses = panes.filter(pane => 
        pane.hasResponse && 
        (pane.response || pane.content) && 
        (pane.response || pane.content).trim().length > 0
    );
    
    // Deduplicate by tool name to get unique AI tools
    const uniqueTools = new Map();
    panesWithResponses.forEach(pane => {
        const toolName = pane.tool;
        if (!uniqueTools.has(toolName)) {
            uniqueTools.set(toolName, pane);
        }
    });
    
    const uniqueToolsArray = Array.from(uniqueTools.values());
    const uniqueToolsCount = uniqueToolsArray.length;
    
    const statusText = document.getElementById('dataStatusText');
    const aiChips = document.getElementById('aiChips');
    
    if (uniqueToolsCount > 0) {
        statusText.textContent = `${uniqueToolsCount} AI response${uniqueToolsCount === 1 ? '' : 's'} loaded`;
        
        // Create AI chips - only for unique tools with responses
        aiChips.innerHTML = '';
        uniqueToolsArray.forEach(pane => {
            const chip = document.createElement('span');
            chip.className = `ai-chip ${pane.tool.toLowerCase()}`;
            chip.textContent = pane.tool;
            aiChips.appendChild(chip);
        });
        
        console.log(`✅ [Synthesis] Data status updated: ${uniqueToolsCount} unique AI tools (from ${panesWithResponses.length} panes with responses, filtered from ${panes.length} total)`);
    } else {
        statusText.textContent = 'Waiting for responses...';
        console.warn(`⚠️ [Synthesis] No panes with responses found (${panes.length} total panes provided)`);
    }
}

function normalizeTrustText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeTrust(text) {
    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were', 'be', 'as', 'by', 'that', 'this', 'it', 'from', 'at']);
    return normalizeTrustText(text)
        .split(' ')
        .filter(token => token && token.length > 2 && !stopwords.has(token));
}

function jaccardSimilarity(a, b) {
    const setA = new Set(tokenizeTrust(a));
    const setB = new Set(tokenizeTrust(b));
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    setA.forEach(token => {
        if (setB.has(token)) intersection++;
    });
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
}

function shannonEntropy(values) {
    if (!values || values.length === 0) return 0;
    const counts = new Map();
    values.forEach(v => {
        counts.set(v, (counts.get(v) || 0) + 1);
    });
    const total = values.length;
    let entropy = 0;
    counts.forEach(count => {
        const p = count / total;
        entropy -= p * Math.log2(p);
    });
    return entropy;
}

function classifyClaimType(text) {
    const t = normalizeTrustText(text);
    if (/\b(should|must|steps|how to|do this|recommend)\b/.test(t)) return 'instruction';
    if (/\b(think|opinion|prefer|arguably|likely)\b/.test(t)) return 'opinion';
    if (/\b(define|means|is called|refers to)\b/.test(t)) return 'definition';
    if (/\b\d+(\.\d+)?\b/.test(t)) return 'number';
    return 'fact';
}

function detectTimeSensitivity(text) {
    const t = normalizeTrustText(text);
    if (/\b(today|current|latest|recent|now|this year|202\d|203\d|month|quarter|deadline)\b/.test(t)) return 'high';
    if (/\b(policy|law|version|release|market|pricing)\b/.test(t)) return 'medium';
    return 'low';
}

function detectUrgencyLevel(text) {
    const t = normalizeTrustText(text);
    if (/\b(call emergency|go to er|emergency now|seek emergency care|dial 911|immediately emergency)\b/.test(t)) return 4;
    if (/\b(urgent|today|immediately seek|same day|prompt medical attention|seek care now)\b/.test(t)) return 3;
    if (/\b(soon|asap|within 24|book an appointment|prompt appointment)\b/.test(t)) return 2;
    if (/\b(follow up|monitor|recheck|routine|watch|track)\b/.test(t)) return 1;
    return 0;
}

function extractAssumptions(text) {
    const lines = String(text || '')
        .split(/[\n\.!?]+/)
        .map(s => s.trim())
        .filter(Boolean);
    const assumptions = lines.filter(line =>
        /\b(assum|depends|if |unless|given|based on|in (the )?(us|eu|uk|switzerland)|for (us|eu|uk|switzerland))\b/i.test(line)
    );
    return assumptions.slice(0, 5);
}

function extractCitations(text) {
    const citations = [];
    const raw = String(text || '');
    const urls = raw.match(/https?:\/\/[^\s)]+/g) || [];
    urls.forEach((url, idx) => {
        citations.push({
            url,
            title: `Source ${idx + 1}`,
            quote: '',
            claim_ids: []
        });
    });
    return citations.slice(0, 6);
}

function isTrustUsablePane(pane) {
    const raw = String(pane?.response || pane?.content || pane?.html || '').trim();
    if (!raw) return false;
    const charCount = raw.length;
    const tokenCount = tokenizeTrust(raw).length;
    const sentenceCount = raw
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 20)
        .length;

    // Ignore malformed/truncated captures so one broken pane does not
    // disproportionately depress Trust Layer reliability.
    if (charCount < 140) return false;
    if (tokenCount < 22) return false;
    if (sentenceCount < 1) return false;
    return true;
}

function buildResponseIR(pane, index) {
    const rawContent = pane.response || pane.content || pane.html || '';
    const sentences = String(rawContent)
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 25)
        .slice(0, 10);
    const claims = sentences.slice(0, 8).map((sentence, cIdx) => ({
        claim_id: `${String(pane.tool || `model${index + 1}`).toLowerCase()}-c${cIdx + 1}`,
        text: sentence,
        type: classifyClaimType(sentence),
        entities: (sentence.match(/\b[A-Z][a-zA-Z]{2,}\b/g) || []).slice(0, 5),
        time_sensitivity: detectTimeSensitivity(sentence),
        verifiability: /\b\d+(\.\d+)?\b|https?:\/\//.test(sentence) ? 'easy' : 'medium',
        confidence_self: /\b(certain|definitely|always)\b/i.test(sentence) ? 0.85 : (/\b(likely|probably|might|may)\b/i.test(sentence) ? 0.55 : 0.7)
    }));
    const citations = extractCitations(rawContent);
    const linkedClaims = claims.slice(0, Math.min(citations.length, claims.length)).map(c => c.claim_id);
    citations.forEach((c, idx) => {
        c.claim_ids = linkedClaims[idx] ? [linkedClaims[idx]] : [];
    });

    return {
        model_id: String(pane.tool || `model_${index + 1}`),
        final_answer: (sentences.slice(0, 3).join(' ') || String(rawContent).slice(0, 500)).trim(),
        claims,
        citations,
        assumptions: extractAssumptions(rawContent)
    };
}

function clusterBySimilarity(items, threshold = 0.34) {
    const clusters = [];
    items.forEach(item => {
        const candidate = clusters.find(cluster => jaccardSimilarity(item.text, cluster.representative.text) >= threshold);
        if (candidate) {
            candidate.items.push(item);
        } else {
            clusters.push({ representative: item, items: [item] });
        }
    });
    return clusters;
}

function getClaimSignature(claimText) {
    const tokens = tokenizeTrust(claimText);
    const significant = tokens.filter(t => t.length >= 4).slice(0, 6);
    return significant.sort().join('|');
}

function buildClaimClusters(irList) {
    const claimEntries = [];
    irList.forEach(ir => {
        (ir.claims || []).forEach(claim => {
            claimEntries.push({
                model_id: ir.model_id,
                text: claim.text,
                type: claim.type,
                time_sensitivity: claim.time_sensitivity,
                signature: getClaimSignature(claim.text)
            });
        });
    });

    const clusters = [];
    claimEntries.forEach(entry => {
        const existing = clusters.find(cluster => {
            if (cluster.signature && entry.signature && cluster.signature === entry.signature) return true;
            return jaccardSimilarity(entry.text, cluster.representative.text) >= 0.46;
        });
        if (existing) {
            existing.items.push(entry);
            existing.models.add(entry.model_id);
            return;
        }
        clusters.push({
            representative: entry,
            signature: entry.signature,
            items: [entry],
            models: new Set([entry.model_id])
        });
    });

    return clusters.sort((a, b) => b.models.size - a.models.size);
}

function extractNumbers(text) {
    const matches = String(text || '').match(/\b\d+(\.\d+)?\b/g) || [];
    return matches.map(Number).filter(Number.isFinite);
}

function hasNegation(text) {
    return /\b(no|not|never|cannot|can't|won't|without|none|neither)\b/i.test(String(text || ''));
}

function detectClaimContradiction(cluster) {
    const items = cluster.items || [];
    if (items.length < 2) return false;

    // Contradiction signal 1: mixed negation in the same clustered claim
    const negFlags = items.map(item => hasNegation(item.text));
    const hasMixedNegation = negFlags.some(Boolean) && negFlags.some(flag => !flag);

    // Contradiction signal 2: same clustered claim but materially diverging numeric facts
    // Keep this conservative: stylistic numeric variation (e.g. 26 vs 26.5, or C/F pairs) is not a contradiction.
    const numberSets = items.map(item => [...new Set(extractNumbers(item.text))]).filter(set => set.length > 0);
    let hasNumericConflict = false;
    if (numberSets.length >= 2) {
        const primaryNumbers = numberSets.map(set => set[0]).filter(Number.isFinite);
        if (primaryNumbers.length >= 2) {
            const min = Math.min(...primaryNumbers);
            const max = Math.max(...primaryNumbers);
            const absDiff = Math.abs(max - min);
            const relativeDiff = min > 0 ? (absDiff / min) : absDiff;

            // Temperature conversion tolerance (e.g. 26.5C ~= 80F)
            const hasTemperatureContext = items.some(item => /\b(c|celsius|f|fahrenheit|°c|°f)\b/i.test(item.text));
            let looksLikeTempConversion = false;
            if (hasTemperatureContext && primaryNumbers.length === 2) {
                const [a, b] = primaryNumbers;
                const aToF = (a * 9 / 5) + 32;
                const bToF = (b * 9 / 5) + 32;
                looksLikeTempConversion = Math.abs(aToF - b) <= 2 || Math.abs(bToF - a) <= 2;
            }

            hasNumericConflict = !looksLikeTempConversion && absDiff >= 3 && relativeDiff >= 0.25;
        }
    }

    return hasMixedNegation || hasNumericConflict;
}

function isHighStakesTopic(text) {
    const t = normalizeTrustText(text);
    return /\b(medical|diagnos|treatment|legal|lawsuit|contract|compliance|finance|financial|investment|tax|trading|security breach|cybersecurity|safety|clinical)\b/.test(t);
}

function computeEvidenceSignalsFromIR(irList) {
    const trustedMedicalDomains = [
        'heart.org', 'ahajournals.org', 'acc.org', 'escardio.org', 'who.int',
        'cdc.gov', 'nih.gov', 'ncbi.nlm.nih.gov', 'nhs.uk', 'nice.org.uk',
        'mayoclinic.org', 'clevelandclinic.org', 'msdmanuals.com', 'medlineplus.gov'
    ];

    const citationDomains = irList.flatMap(ir => (ir.citations || []).map(c => {
        try {
            return new URL(c.url).hostname.toLowerCase();
        } catch (_e) {
            return null;
        }
    })).filter(Boolean);

    const totalCitations = citationDomains.length;
    const trustedCitationCount = citationDomains.filter(domain =>
        trustedMedicalDomains.some(allowed => domain === allowed || domain.endsWith(`.${allowed}`))
    ).length;
    const uniqueDomains = new Set(citationDomains).size;
    const uniqueTrustedDomains = new Set(
        citationDomains.filter(domain => trustedMedicalDomains.some(allowed => domain === allowed || domain.endsWith(`.${allowed}`)))
    ).size;

    const corpusText = irList.map(ir =>
        `${ir.final_answer}\n${(ir.claims || []).map(c => c.text).join(' ')}`
    ).join('\n');
    const authorityMentioned = /\b(aha|acc|esc|who|cdc|nih|nhs|nice|guideline|clinical guideline)\b/i.test(corpusText);

    const evidencePresent = (totalCitations > 0 || authorityMentioned) ? 1 : 0;
    const evidenceVerified = totalCitations > 0
        ? Math.max(0, Math.min(1, trustedCitationCount / totalCitations))
        : 0;

    let tier = 0;
    if (evidencePresent === 0) {
        tier = 0;
    } else if (evidenceVerified <= 0) {
        tier = 1; // citations/authorities present but not verified
    } else if (evidenceVerified >= 0.8 && uniqueTrustedDomains >= 2) {
        tier = 3;
    } else if (evidenceVerified >= 0.5) {
        tier = 2;
    } else {
        tier = 1;
    }

    const score = tier === 0 ? 0 : (tier === 1 ? 0.33 : (tier === 2 ? 0.66 : 1.0));
    return {
        tier,
        score,
        evidencePresent,
        evidenceVerified: Number(evidenceVerified.toFixed(3)),
        totalCitations,
        trustedCitationCount,
        uniqueDomains
    };
}

function hasMedicalSafetyDisclaimer(text) {
    return /\b(not medical advice|consult (a )?(doctor|clinician|healthcare professional)|seek medical attention|for educational purposes)\b/i.test(String(text || ''));
}

function computeTrustLayer(panes = []) {
    const nonEmptyPanes = panes.filter(p => (p.response || p.content || p.html || '').trim().length > 0);
    let validPanes = nonEmptyPanes.filter(isTrustUsablePane);
    if (validPanes.length < 3) {
        // Fallback: keep non-empty panes when strict quality gate leaves too few voters.
        validPanes = nonEmptyPanes;
    }
    const excludedForQuality = Math.max(0, nonEmptyPanes.length - validPanes.length);
    const irList = validPanes.map((pane, idx) => buildResponseIR(pane, idx));

    const answerItems = irList.map(ir => ({ model: ir.model_id, text: ir.final_answer }));
    const answerClusters = clusterBySimilarity(answerItems, 0.27).sort((a, b) => b.items.length - a.items.length);
    const largestCluster = answerClusters[0] || { items: [] };
    const runnerUpCluster = answerClusters[1] || { items: [] };
    const n = Math.max(irList.length, 1);

    const claimClusters = buildClaimClusters(irList);
    const coreClaimClusters = claimClusters
        .filter(cluster => cluster.representative?.text?.length > 20)
        .slice(0, 8);

    const baseAnswerAgreement = largestCluster.items.length / n;
    let agreement = baseAnswerAgreement;
    if (coreClaimClusters.length > 0) {
        const sharedCore = coreClaimClusters.filter(cluster => cluster.models.size >= 2).slice(0, 4);
        if (sharedCore.length > 0) {
            const sharedCoverage = sharedCore.map(cluster => cluster.models.size / n);
            const sharedAgreement = sharedCoverage.reduce((sum, value) => sum + value, 0) / sharedCoverage.length;
            // Blend answer-level and claim-level signals, but avoid over-penalizing aligned outputs.
            const blended = (0.35 * baseAnswerAgreement) + (0.65 * sharedAgreement);
            agreement = Math.max(baseAnswerAgreement * 0.9, blended);
        }
    }

    // Concept-level agreement floor: if models consistently share the same key concepts,
    // avoid under-scoring agreement due to stylistic phrasing differences.
    const perModelTermSets = irList.map(ir => {
        const combined = [ir.final_answer, ...(ir.claims || []).map(c => c.text)].join(' ');
        return new Set(tokenizeTrust(combined).filter(t => t.length >= 4));
    });
    const termModelCount = new Map();
    perModelTermSets.forEach(set => {
        set.forEach(term => {
            termModelCount.set(term, (termModelCount.get(term) || 0) + 1);
        });
    });
    const minModelsForCore = Math.max(2, Math.ceil(n * 0.5));
    const coreConcepts = [...termModelCount.entries()]
        .filter(([, count]) => count >= minModelsForCore)
        .map(([term]) => term)
        .slice(0, 20);
    if (coreConcepts.length > 0 && perModelTermSets.length > 0) {
        const conceptCoveragePerModel = perModelTermSets.map(set => {
            const covered = coreConcepts.filter(term => set.has(term)).length;
            return covered / coreConcepts.length;
        });
        const conceptAgreement = conceptCoveragePerModel.reduce((sum, v) => sum + v, 0) / conceptCoveragePerModel.length;
        agreement = Math.max(agreement, conceptAgreement * 0.9);
    }

    agreement = Math.max(0, Math.min(1, agreement));
    const clusterCount = answerClusters.length;
    const largestClusterSize = largestCluster.items.length || 0;
    const runnerUpClusterSize = runnerUpCluster.items.length || 0;
    const runnerUpRatio = runnerUpClusterSize / n;

    const majorityTexts = largestCluster.items.map(item => item.text);
    let overlap = 0;
    const sharedClaimPhrasings = coreClaimClusters.filter(cluster => cluster.models.size >= 2).map(cluster => cluster.items.map(i => i.text));
    if (sharedClaimPhrasings.length > 0) {
        let pairCount = 0;
        sharedClaimPhrasings.forEach(phrases => {
            for (let i = 0; i < phrases.length; i++) {
                for (let j = i + 1; j < phrases.length; j++) {
                    overlap += jaccardSimilarity(phrases[i], phrases[j]);
                    pairCount++;
                }
            }
        });
        if (pairCount > 0) {
            overlap /= pairCount;
        } else if (majorityTexts.length > 1) {
            for (let i = 0; i < majorityTexts.length; i++) {
                for (let j = i + 1; j < majorityTexts.length; j++) {
                    overlap += jaccardSimilarity(majorityTexts[i], majorityTexts[j]);
                    pairCount++;
                }
            }
            overlap = pairCount > 0 ? overlap / pairCount : 0;
        }
    } else if (majorityTexts.length > 1) {
        let pairCount = 0;
        for (let i = 0; i < majorityTexts.length; i++) {
            for (let j = i + 1; j < majorityTexts.length; j++) {
                overlap += jaccardSimilarity(majorityTexts[i], majorityTexts[j]);
                pairCount++;
            }
        }
        overlap = pairCount > 0 ? overlap / pairCount : 0;
    }

    const assumptionSet = irList.flatMap(ir => ir.assumptions || []).map(normalizeTrustText).filter(Boolean);
    const assumptionEntropyRaw = shannonEntropy(assumptionSet);
    const assumptionEntropy = Math.min(1, assumptionEntropyRaw / 2.5);
    const diversityFromClusters = Math.min(1, coreClaimClusters.length > 0 ? (coreClaimClusters.filter(cluster => cluster.models.size >= 2).length / coreClaimClusters.length) : 0);
    let independenceScore = Math.max(0, Math.min(1, (1 - overlap) * 0.65 + assumptionEntropy * 0.2 + diversityFromClusters * 0.15));

    // Consensus inflation guard (Effective Agreement):
    // EA = A * D * Ie * dispersionPenalty
    // - A: raw agreement
    // - D: cluster dominance (penalize thin majorities)
    // - Ie: effective independence from N_eff
    // - dispersionPenalty: penalize fragmented cluster landscapes
    const dominance = largestClusterSize > 0
        ? Math.max(0, 1 - (runnerUpClusterSize / largestClusterSize))
        : 0;
    const effectiveVoterCount = 1 + ((n - 1) * independenceScore);
    const effectiveIndependence = n > 0 ? Math.sqrt(Math.max(0, effectiveVoterCount / n)) : 0;
    const dispersionPenalty = 1 / Math.sqrt(Math.max(1, clusterCount));
    const effectiveAgreement = Math.max(0, Math.min(1, agreement * dominance * effectiveIndependence * dispersionPenalty));

    const allClaims = irList.flatMap(ir => ir.claims || []);
    const highTimeClaims = allClaims.filter(c => c.time_sensitivity === 'high').length;
    const timeSensitivityRisk = allClaims.length ? highTimeClaims / allClaims.length : 0;

    const corpusText = irList.map(ir => `${ir.final_answer}\n${(ir.claims || []).map(c => c.text).join(' ')}`).join('\n');
    const highStakesTopic = isHighStakesTopic(corpusText);
    const evidence = computeEvidenceSignalsFromIR(irList);
    const contradictionClusters = coreClaimClusters.filter(cluster => detectClaimContradiction(cluster));
    const contradictionCount = contradictionClusters.length;
    const contradictionRisk = coreClaimClusters.length > 0 ? contradictionCount / coreClaimClusters.length : 0;
    const lowRiskNoContradiction = contradictionCount === 0 && timeSensitivityRisk <= 0.2;
    const evidenceScoreAdjusted = (evidence.tier === 0 && lowRiskNoContradiction && !highStakesTopic) ? 0.2 : evidence.score;

    const urgencyLevels = irList.map(ir => detectUrgencyLevel([ir.final_answer, ...(ir.claims || []).map(c => c.text)].join(' ')));
    const maxUrgency = urgencyLevels.length ? Math.max(...urgencyLevels) : 0;
    const minUrgency = urgencyLevels.length ? Math.min(...urgencyLevels) : 0;
    const urgencySpread = Math.max(0, maxUrgency - minUrgency);
    const urgencyConflictRisk = Math.max(0, Math.min(1, urgencySpread / 4));

    const disclaimerMentions = irList.filter(ir => hasMedicalSafetyDisclaimer(
        `${ir.final_answer}\n${(ir.claims || []).map(c => c.text).join(' ')}`
    )).length;
    const disclaimerCoverage = n > 0 ? disclaimerMentions / n : 0;

    // Reliability score emphasizes factual alignment and contradiction safety.
    let evidenceWeight = highStakesTopic ? 0.10 : 0.04;
    if (!highStakesTopic && timeSensitivityRisk < 0.1 && contradictionCount === 0) {
        evidenceWeight *= 0.6;
    }
    const agreementWeight = highStakesTopic ? 0.58 : 0.62;
    const independenceWeight = 0.10;
    const timePenaltyWeight = highStakesTopic ? 0.10 : 0.08;
    const contradictionPenaltyWeight = 0.17;
    const urgencyPenaltyWeight = highStakesTopic ? 0.12 : 0.06;

    // Independence modulates agreement strength while effectiveAgreement guards against consensus inflation.
    const independenceAgreementModifier = 0.75 + (0.25 * independenceScore);
    const agreementForScore = Math.max(
        0,
        Math.min(1, ((0.6 * agreement) + (0.4 * effectiveAgreement)) * independenceAgreementModifier)
    );

    // Nonlinear time penalty prevents moderate time risk from collapsing trust.
    const timePenalty = Math.pow(timeSensitivityRisk, 2);

    let trustScore =
        (agreementWeight * agreementForScore) +
        (evidenceWeight * evidenceScoreAdjusted) +
        (independenceWeight * independenceScore) -
        (timePenaltyWeight * timePenalty) -
        (contradictionPenaltyWeight * contradictionRisk) -
        (urgencyPenaltyWeight * urgencyConflictRisk);

    trustScore = Math.max(0, Math.min(1, trustScore));

    // Calibration floor: prevent obvious false negatives for low-risk, non-contradictory multi-model outputs
    if (n >= 3 && lowRiskNoContradiction && agreementForScore >= 0.55) {
        trustScore = Math.max(trustScore, 0.55);
        independenceScore = Math.max(independenceScore, 0.35);
    }
    if (n >= 5 && contradictionCount === 0 && agreementForScore >= 0.62 && timeSensitivityRisk < 0.1) {
        trustScore = Math.max(trustScore, 0.62);
    }
    if (agreementForScore > 0.5 && contradictionCount === 0 && timeSensitivityRisk < 0.4) {
        trustScore = Math.max(trustScore, 0.45);
    }
    // High-stakes calibration: allow "Likely" when consensus is strong and non-contradictory
    // even with weak citation structure, while still blocking "Reliable" without evidence.
    const highStakesConsensusLikely =
        highStakesTopic &&
        n >= 4 &&
        contradictionCount === 0 &&
        agreementForScore >= 0.62 &&
        timeSensitivityRisk <= 0.2;
    if (highStakesConsensusLikely && evidence.tier <= 1) {
        trustScore = Math.max(trustScore, 0.5);
    }

    // Safety rails
    const safetyRailTriggered = agreement >= 0.7 && evidence.tier <= 1 && timeSensitivityRisk >= 0.3;

    let label = trustScore >= 0.75 ? 'Reliable' : (trustScore >= 0.5 ? 'Likely' : 'Uncertain');
    let cappedByEvidence = false;
    if (safetyRailTriggered && label === 'Reliable') {
        label = 'Likely';
    }
    if (urgencyConflictRisk >= 0.5 && label === 'Reliable') {
        label = 'Likely';
    }
    if (highStakesTopic && evidence.tier < 2 && label === 'Reliable') {
        label = 'Likely';
        cappedByEvidence = true;
    }
    if (highStakesConsensusLikely && evidence.tier <= 1 && label === 'Uncertain') {
        label = 'Likely';
        cappedByEvidence = true;
    }

    let reason = 'Models show variation in framing and detail.';
    if (label === 'Reliable') {
        reason = 'Models are highly aligned on the core conclusions.';
    } else if (contradictionCount > 0) {
        reason = 'A few claims are expressed differently across models.';
    } else if (agreementForScore >= 0.5 && contradictionCount === 0) {
        reason = evidence.tier <= 1
            ? 'Models mostly align, with moderate source support.'
            : 'Models mostly align with stable support signals.';
    } else if (agreement >= 0.7 && evidence.tier <= 1) {
        reason = 'Models agree, with limited source verification available.';
    } else if (clusterCount > 1) {
        reason = 'Models vary in emphasis on a few points.';
    }
    if (safetyRailTriggered) {
        reason = 'High agreement with limited support on time-sensitive details.';
    }
    if (cappedByEvidence) {
        reason = 'Core conclusions align, with additional source validation still beneficial for high-stakes use.';
    }
    if (excludedForQuality > 0 && contradictionCount === 0 && agreementForScore >= 0.55) {
        reason += ` ${excludedForQuality} low-quality capture${excludedForQuality === 1 ? '' : 's'} excluded from trust scoring.`;
    }

    // Deployability score is distinct from factual reliability.
    let deployabilityScore =
        (0.45 * evidence.evidenceVerified) +
        (0.20 * evidence.evidencePresent) +
        (0.15 * disclaimerCoverage) +
        (0.10 * (1 - urgencyConflictRisk)) +
        (0.10 * (1 - contradictionRisk));
    if (highStakesTopic && evidence.tier < 2) {
        deployabilityScore = Math.min(deployabilityScore, 0.45);
    }
    if (highStakesTopic && disclaimerCoverage < 0.5) {
        deployabilityScore -= 0.08;
    }
    deployabilityScore = Math.max(0, Math.min(1, deployabilityScore));
    let deployabilityLabel = deployabilityScore >= 0.75 ? 'Ready' : (deployabilityScore >= 0.5 ? 'Review Suggested' : 'Verification Pending');
    const healthPolicyGate = highStakesTopic && evidence.tier < 2;
    if (healthPolicyGate) {
        deployabilityLabel = 'Verification Pending';
    }
    let deployabilityReason = deployabilityLabel === 'Ready'
        ? 'Signals are stable for general usage.'
        : (deployabilityLabel === 'Review Suggested'
            ? 'A brief verification pass is suggested for high-impact usage.'
            : 'Additional verification is recommended before professional usage.');
    if (healthPolicyGate) {
        deployabilityReason = 'For this high-stakes topic, additional verification is recommended before professional usage.';
    }

    // Contested points: only contradiction-like clusters, not mere difference in emphasis
    const contestedPoints = contradictionClusters
        .map(cluster => {
            const variants = [...new Set((cluster.items || []).map(i => i.text.trim()).filter(Boolean))];
            return {
                claim: cluster.representative?.text || variants[0] || '',
                variants: variants.slice(0, 3)
            };
        })
        .filter(item => item.claim)
        .slice(0, 4)
        .map(item => ({
            claim: item.claim,
            variants: item.variants,
            resolution_hint: 'Resolve by adding region/date constraints or citing a primary source.'
        }));

    return {
        generatedAt: new Date().toISOString(),
        responseCount: irList.length,
        ir: irList,
        agreement: Number(agreement.toFixed(3)),
        clusterCount,
        runnerUpRatio: Number(runnerUpRatio.toFixed(3)),
        overlap: Number(overlap.toFixed(3)),
        dominance: Number(dominance.toFixed(3)),
        effectiveVoterCount: Number(effectiveVoterCount.toFixed(3)),
        effectiveIndependence: Number(effectiveIndependence.toFixed(3)),
        effectiveAgreement: Number(effectiveAgreement.toFixed(3)),
        agreementForScore: Number(agreementForScore.toFixed(3)),
        independenceAgreementModifier: Number(independenceAgreementModifier.toFixed(3)),
        assumptionEntropy: Number(assumptionEntropy.toFixed(3)),
        independenceScore: Number(independenceScore.toFixed(3)),
        evidenceTier: evidence.tier,
        evidenceScore: evidence.score,
        evidenceScoreAdjusted: Number(evidenceScoreAdjusted.toFixed(3)),
        evidencePresent: evidence.evidencePresent,
        evidenceVerified: evidence.evidenceVerified,
        timeSensitivityRisk: Number(timeSensitivityRisk.toFixed(3)),
        timePenalty: Number(timePenalty.toFixed(3)),
        urgencySpread: Number(urgencySpread.toFixed(3)),
        urgencyConflictRisk: Number(urgencyConflictRisk.toFixed(3)),
        disclaimerCoverage: Number(disclaimerCoverage.toFixed(3)),
        highStakesTopic,
        excludedForQuality,
        contradictionCount,
        contradictionRisk: Number(contradictionRisk.toFixed(3)),
        trustScore: Number(trustScore.toFixed(3)),
        label,
        reason,
        safetyRailTriggered,
        cappedByEvidence,
        deployabilityScore: Number(deployabilityScore.toFixed(3)),
        deployabilityLabel,
        deployabilityReason,
        healthPolicyGate,
        contestedPoints
    };
}

function buildTrustPromptContext(trustLayer) {
    if (!trustLayer) return 'No trust layer computed.';
    const contested = (trustLayer.contestedPoints || [])
        .slice(0, 3)
        .map((point, idx) => `${idx + 1}. ${point.claim}`)
        .join('\n');
    const reliabilityBand = trustLayer.label === 'Reliable'
        ? 'Strong Alignment'
        : trustLayer.label === 'Likely'
            ? 'Broad Alignment'
            : 'Mixed Alignment';
    const evidenceSummary = trustLayer.evidenceTier >= 2
        ? 'Evidence support is reasonably verified.'
        : trustLayer.evidencePresent
            ? 'Sources are cited but not independently verified yet.'
            : 'No concrete sources detected.';
    return [
        `User-facing style rule: synthesis-first, calm, clear, and neutral.`,
        `Primary objective: deliver the best combined answer, not a risk report.`,
        `Do not act as an adviser, decision-maker, regulator, or judge.`,
        `Do not prescribe what the user should do.`,
        `Do not use alarmist/compliance-heavy headers unless explicitly requested.`,
        `Avoid legal/audit wording by default; keep the tone constructive and practical.`,
        `Start with a concise direct answer, then include key insights and brief explanation where helpful.`,
        `Avoid unnecessary verbosity, but preserve important reasoning, nuance, and evidence when it improves understanding.`,
        `When models disagree, briefly explain the difference and synthesize the most reliable combined conclusion.`,
        `Confidence band: ${reliabilityBand}`,
        `Agreement signal: ${Math.round((trustLayer.agreement || 0) * 100)}%`,
        `Evidence summary: ${evidenceSummary}`,
        `Trust checks are internal quality controls; keep them secondary in the narrative.`,
        `Trust reason: ${trustLayer.reason}`,
        contested ? `Contested points:\n${contested}` : 'Contested points: none detected'
    ].join('\n');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function extractDecisionSnapshotBestAnswer() {
    const preferredModes = ['bestof', 'executive', 'comprehensive'];
    for (const mode of preferredModes) {
        const content = String(synthesisResults?.[mode]?.content || '').trim();
        if (!content) continue;
        const cleaned = sanitizeRenderedSynthesisText(content)
            .replace(/[`#>*_-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!cleaned) continue;
        return cleaned.slice(0, 180) + (cleaned.length > 180 ? '…' : '');
    }
    return 'Synthesis summary available below.';
}

function renderDecisionSnapshotCard() {
    const card = document.getElementById('decisionSnapshotCard');
    if (!card) return;
    const trust = comparisonData?.trustLayer || {};
    const totalModels = Number(trust.responseCount || comparisonData?.panes?.length || 0);
    const agreementPct = Math.max(0, Math.min(100, Math.round(Number(trust.agreement || 0) * 100)));
    const alignedModels = totalModels > 0
        ? Math.max(1, Math.round((agreementPct / 100) * totalModels))
        : 0;
    const confidence = trust.label === 'Reliable'
        ? 'High'
        : trust.label === 'Likely'
            ? 'Medium'
            : 'Low';
    const disagreement = Array.isArray(trust.contestedPoints) && trust.contestedPoints.length
        ? String(trust.contestedPoints[0]?.claim || '').trim()
        : 'No major disagreement detected';
    const recommendation = confidence === 'High'
        ? 'Proceed with the synthesized answer; validate critical facts if stakes are high.'
        : confidence === 'Medium'
            ? 'Use the synthesis as a working direction and verify the contested point.'
            : 'Review detailed differences before making a final decision.';
    const bestAnswer = extractDecisionSnapshotBestAnswer();

    card.innerHTML = `
        <div class="decision-snapshot-card">
            <div class="decision-snapshot-title">Decision Snapshot</div>
            <div class="decision-snapshot-row"><strong>Best Answer:</strong> ${escapeHtml(bestAnswer)}</div>
            <div class="decision-snapshot-row"><strong>Confidence:</strong> ${escapeHtml(confidence)}</div>
            <div class="decision-snapshot-row"><strong>Agreement level:</strong> ${totalModels > 0 ? `${alignedModels}/${totalModels} models` : 'Not available'}</div>
            <div class="decision-snapshot-row"><strong>Main disagreement:</strong> ${escapeHtml(disagreement || 'No major disagreement detected')}</div>
            <div class="decision-snapshot-row"><strong>Recommended action:</strong> ${escapeHtml(recommendation)}</div>
        </div>
    `;
    card.style.display = 'block';
}

function renderTrustLayerCard() {
    const trustCard = document.getElementById('trustLayerCard');
    if (!trustCard) return;
    const trust = comparisonData?.trustLayer;
    if (!trust) {
        trustCard.style.display = 'none';
        trustCard.innerHTML = '';
        return;
    }

    const badgeColor = trust.label === 'Reliable'
        ? '#10b981'
        : trust.label === 'Likely'
            ? '#3b82f6'
            : '#6366f1';
    const confidenceLabel = 'Shared Core Insight';
    const calmMessage = 'Models converge on the same core understanding, with differences mainly in framing and detail depth.';
    const deployabilityMessage = 'This synthesis reflects shared agreement across perspectives and is appropriate for general decision-making.';
    const advancedContested = (trust.contestedPoints || []).length
        ? `<ul style="margin: 8px 0 0 18px; color: var(--text-secondary); font-size: 13px;">${
            trust.contestedPoints.map(point => `<li>${escapeHtml(point.claim)}</li>`).join('')
        }</ul>`
        : '<p style="color: var(--text-secondary); font-size: 13px; margin-top: 8px;">No major contested points detected.</p>';

    trustCard.innerHTML = `
        <div style="border: 1px solid var(--border); background: rgba(15, 23, 42, 0.65); border-radius: 12px; padding: 14px; margin: 6px 0 14px;">
            <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 11px; letter-spacing: 0.4px; color: var(--text-secondary); text-transform: uppercase;">Decision Signal</span>
                <span style="font-size: 12px; font-weight: 700; padding: 4px 8px; border-radius: 999px; background: ${badgeColor}; color: #ffffff;">${escapeHtml(confidenceLabel)}</span>
                <span style="font-size: 12px; color: var(--text-secondary);">Checked across ${trust.responseCount || 0} perspectives</span>
            </div>
            <p style="font-size: 13px; color: var(--text); margin-bottom: 6px;">${escapeHtml(calmMessage)}</p>
            <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">${escapeHtml(deployabilityMessage)}</p>
            <details style="border-top: 1px solid var(--border); padding-top: 8px;">
                <summary style="cursor: pointer; color: var(--text-secondary); font-size: 12px; font-weight: 600;">Trust Summary</summary>
                <div style="margin-top: 8px;">
                    <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 6px 0;"><strong>Consensus — Mixed</strong><br>Models agree on the main idea, while emphasizing different angles.</p>
                    <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 6px 0;"><strong>Usage Guidance — General guidance</strong><br>Best used as a clear directional summary rather than specialized or technical advice.</p>
                    <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 6px 0;"><strong>Source Strength — Light</strong><br>Insights are based on model reasoning and limited explicit source citation.</p>
                    <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 8px 0;"><strong>Variation Level — Moderate</strong><br>Differences exist in presentation and emphasis, not in the core conclusion.</p>
                    <details style="margin-top: 6px;">
                        <summary style="cursor: pointer; color: var(--text-secondary); font-size: 12px;">Quick Meaning</summary>
                        <div style="margin-top: 8px;">
                            <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 6px 0;"><strong>Quick meaning:</strong></p>
                            <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 6px 0;">High/Broad/Mixed = how strongly models align.</p>
                            <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 6px 0;">General use/guidance = whether it’s normal decision use vs more cautionary framing (e.g., health gate).</p>
                            <p style="font-size: 12px; color: var(--text-secondary); margin: 0 0 6px 0;">Established/Cited/Light = evidence depth.</p>
                            <p style="font-size: 12px; color: var(--text-secondary); margin: 0;">Low/Moderate/Noticeable = how much model framing or urgency differs.</p>
                        </div>
                    </details>
                    <details style="margin-top: 6px;">
                        <summary style="cursor: pointer; color: var(--text-secondary); font-size: 12px;">Advanced Trust Analysis</summary>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 8px 0;">
                            <div style="padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: rgba(30, 41, 59, 0.45); font-size: 12px;"><strong>Consensus</strong><br>${trust.label === 'Reliable' ? 'High' : trust.label === 'Likely' ? 'Broad' : 'Mixed'}</div>
                            <div style="padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: rgba(30, 41, 59, 0.45); font-size: 12px;"><strong>Usage Guidance</strong><br>${trust.healthPolicyGate ? 'General guidance' : 'General use'}</div>
                            <div style="padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: rgba(30, 41, 59, 0.45); font-size: 12px;"><strong>Source Strength</strong><br>${trust.evidenceTier >= 2 ? 'Established' : trust.evidencePresent ? 'Cited' : 'Light'}</div>
                            <div style="padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: rgba(30, 41, 59, 0.45); font-size: 12px;"><strong>Variation Level</strong><br>${trust.urgencyConflictRisk > 0.45 ? 'Noticeable' : (trust.urgencyConflictRisk > 0.2 ? 'Moderate' : 'Low')}</div>
                        </div>
                        <div style="font-size: 12px; color: var(--text); margin-top: 4px;">
                            <strong>Contested points</strong>
                            ${advancedContested}
                        </div>
                    </details>
                </div>
            </details>
        </div>
    `;
    trustCard.style.display = 'block';
}

// Select synthesis mode (toggle selection)
function selectMode(mode) {
    const card = document.querySelector(`[data-mode="${mode}"]`);
    if (card) {
        // Toggle selection
        card.classList.toggle('selected');
        // Update selectedModes array
        if (card.classList.contains('selected')) {
            if (!selectedModes.includes(mode)) {
                selectedModes.push(mode);
            }
        } else {
            selectedModes = selectedModes.filter(m => m !== mode);
        }
        // Update button text to reflect selected count
        updateSynthesisButtonText();
    }
}

// Select all synthesis modes
function selectAllModes() {
    const allModes = ['comprehensive', 'executive', 'consensus', 'divergence', 'quality', 'improvement', 'bestof'];
    allModes.forEach(mode => {
        const card = document.querySelector(`[data-mode="${mode}"]`);
        if (card && !card.classList.contains('selected')) {
            card.classList.add('selected');
        }
    });
    selectedModes = [...allModes];
    console.log('[Synthesis] All modes selected:', selectedModes);
    // Update button text
    updateSynthesisButtonText();
}

// Deselect all synthesis modes
function deselectAllModes() {
    const allModes = ['comprehensive', 'executive', 'consensus', 'divergence', 'quality', 'improvement', 'bestof'];
    allModes.forEach(mode => {
        const card = document.querySelector(`[data-mode="${mode}"]`);
        if (card) {
            card.classList.remove('selected');
        }
    });
    selectedModes = [];
    console.log('[Synthesis] All modes deselected');
    // Update button text
    updateSynthesisButtonText();
}

// Sync visual selection state with selectedModes array
function syncVisualSelectionState() {
    const allModes = ['comprehensive', 'executive', 'consensus', 'divergence', 'quality', 'improvement', 'bestof'];
    allModes.forEach(mode => {
        const card = document.querySelector(`[data-mode="${mode}"]`);
        if (card) {
            if (selectedModes.includes(mode)) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        }
    });
}

// Update synthesis button text to reflect selected mode count
// Update synthesis button text to reflect selected mode count
function updateSynthesisButtonText() {
    const button = document.getElementById('runSynthesis');
    const estimatedTime = document.getElementById('estimatedTime');
    
    if (!button) return;
    
    // Only update button text if not currently generating (button not disabled or not showing generating message)
    const isGenerating = button.disabled && button.innerHTML.includes('Generating');
    
    if (!isGenerating) {
        const count = selectedModes.length;
        
        if (count === 0) {
            button.innerHTML = '🚀 Generate Analyses';
            if (estimatedTime) estimatedTime.style.display = 'none';
        } else if (count === 7) {
            button.innerHTML = '🚀 Generate All 7 Analyses';
            if (estimatedTime) {
                estimatedTime.style.display = 'inline-block';
                estimatedTime.textContent = '⏱️ ~30-60 seconds';
            }
        } else {
            button.innerHTML = `🚀 Generate Selected (${count})`;
            const estimatedSeconds = Math.ceil(count * 8); // ~8 seconds per analysis
            if (estimatedTime) {
                estimatedTime.style.display = 'inline-block';
                estimatedTime.textContent = `⏱️ ~${estimatedSeconds}-${estimatedSeconds + 20} seconds`;
            }
        }
    }
}

// Run synthesis for selected modes only
async function runSynthesis() {
    if (!comparisonData || !comparisonData.panes || comparisonData.panes.length === 0) {
        showToast('❌ No comparison data available. Please go back and compare responses first.');
        return;
    }
    
    // Check if any modes are selected
    if (selectedModes.length === 0) {
        showToast('⚠️ Please select at least one analysis mode first.');
        return;
    }
    
    const button = document.getElementById('runSynthesis');
    const modeCount = selectedModes.length;
    if (isFocusedSynthesis) {
        button.innerHTML = '⏳ Forging your final answer…';
    } else {
        button.innerHTML = `⏳ Analyzing ${modeCount} ${modeCount === 1 ? 'perspective' : 'perspectives'}…`;
    }
    button.disabled = true;
    
    // Magic Moment staged animation (if available on this page)
    if (typeof showMagicMoment === 'function') {
        await showMagicMoment();
    }
    
    // Show progress container first
    const progressContainer = document.getElementById('progressContainer');
    if (progressContainer) {
        progressContainer.classList.add('show');
        
        // Reset progress indicators (after container is shown)
        setTimeout(() => {
            selectedModes.forEach(mode => {
                updateProgress(mode, 'pending');
            });
        }, 100);
    }
    
    try {
        comparisonData.trustLayer = computeTrustLayer(comparisonData.panes || []);
        renderTrustLayerCard();
        // Create synthesis engine
        const engine = new SynthesisEngine(comparisonData);
        
        // Store old results to compare for cache detection
        const oldSynthesisResults = { ...synthesisResults };
        
        // Check if all selected modes are already cached (for early return)
        const allCached = selectedModes.every(mode => {
            const existing = synthesisResults[mode];
            const isCached = existing && existing.status === 'success' && existing.content;
            if (!isCached) {
                console.log(`🔄 [Synthesis] Mode ${mode} not cached - will generate via API`);
            }
            return isCached;
        });
        
        if (allCached) {
            // All selected modes are cached - show message and return early
            console.log(`📦 [Synthesis] All ${selectedModes.length} selected ${selectedModes.length === 1 ? 'mode' : 'modes'} are cached - skipping API calls`);
            showToast(`✅ All ${selectedModes.length} ${selectedModes.length === 1 ? 'analysis' : 'analyses'} loaded from cache (no API calls)`);
            displayResults();
            const button = document.getElementById('runSynthesis');
            updateSynthesisButtonText();
            button.disabled = false;
            return;
        }
        
        console.log(`🚀 [Synthesis] Starting generation - ${selectedModes.length} ${selectedModes.length === 1 ? 'mode' : 'modes'} selected, some will require API calls`);
        
        // Run only selected modes (with caching - skip already generated)
        const results = await engine.runSelectedAnalyses(selectedModes, synthesisResults);
        
        // Merge new results with existing ones
        synthesisResults = { ...synthesisResults, ...results };
        
        // Update progress indicators for selected modes
        selectedModes.forEach(mode => {
            if (synthesisResults[mode] && synthesisResults[mode].status === 'success') {
                updateProgress(mode, 'completed');
            } else {
                updateProgress(mode, 'error');
            }
        });
        
        // Display results
        displayResults();
        
        // Auto-scroll to results section when results appear (eliminates manual scroll)
        setTimeout(() => {
            const resultsContainer = document.getElementById('resultsContainer');
            if (resultsContainer && resultsContainer.classList.contains('show')) {
                resultsContainer.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start',
                    inline: 'nearest'
                });
            }
        }, 500); // Small delay to ensure DOM is fully updated
        
        // Count new vs cached results (check against old results before merge)
        const newCount = Object.keys(results).filter(mode => {
            // If mode was in old results, it was cached; otherwise it's new
            const wasCached = oldSynthesisResults[mode] && oldSynthesisResults[mode].status === 'success' && oldSynthesisResults[mode].content;
            return !wasCached && results[mode] && results[mode].status === 'success';
        }).length;
        const cachedCount = Object.keys(results).filter(mode => {
            // Count modes that were already in old results
            return oldSynthesisResults[mode] && oldSynthesisResults[mode].status === 'success' && oldSynthesisResults[mode].content;
        }).length;
        
        // Show completion message
        if (cachedCount > 0 && newCount > 0) {
            showToast(`✅ ${newCount} ${newCount === 1 ? 'analysis' : 'analyses'} generated, ${cachedCount} ${cachedCount === 1 ? 'analysis' : 'analyses'} loaded from cache`);
        } else if (cachedCount > 0 && newCount === 0) {
            showToast(`✅ All ${cachedCount} ${cachedCount === 1 ? 'analysis' : 'analyses'} loaded from cache (no API calls)`);
        } else {
            showToast(`✅ ${newCount} ${newCount === 1 ? 'analysis' : 'analyses'} completed successfully`);
        }
        
    } catch (error) {
        console.error('Synthesis failed:', error);
        showToast(`❌ Error: ${error.message}`);
    } finally {
        updateSynthesisButtonText();
        button.disabled = false;
        
        // Hide estimated time after completion
        const estimatedTime = document.getElementById('estimatedTime');
        if (estimatedTime) {
            estimatedTime.style.display = 'none';
        }
        
        // Update usage widget after generation (NEW: Ultra-generous free tier)
        if (typeof updateUsageWidget === 'function') {
            updateUsageWidget();
        }
    }
}

// Cache-only regenerate path for focused Forge mode.
// This guarantees no additional Claude/OpenAI calls on regenerate.
async function regenerateFromCache() {
    if (!isFocusedSynthesis) {
        return runSynthesis();
    }

    const modes = selectedModes.length > 0 ? [...selectedModes] : ['bestof'];
    const allCached = modes.every(mode => {
        const existing = synthesisResults[mode];
        return existing && existing.status === 'success' && existing.content;
    });

    if (!allCached) {
        showToast('⚠️ No cached Forge result available yet. Please wait for the current generation to finish.');
        return;
    }

    modes.forEach(mode => updateProgress(mode, 'completed'));
    displayResults();
    showToast(`✅ Reloaded ${modes.length} cached ${modes.length === 1 ? 'analysis' : 'analyses'} (no API calls).`);
}

if (typeof window !== 'undefined') {
    window.regenerateFromCache = regenerateFromCache;
}

// Update progress indicator
function updateProgress(mode, status) {
    const progressItem = document.querySelector(`.progress-item[data-mode="${mode}"]`);
    if (!progressItem) {
        console.warn(`Progress item not found for mode: ${mode}`);
        return;
    }
    
    const icon = progressItem.querySelector('.progress-icon');
    if (!icon) {
        console.warn(`Progress icon not found for mode: ${mode}`);
        return;
    }
    
    icon.className = 'progress-icon';
    
    switch (status) {
        case 'pending':
            icon.textContent = '⏳';
            icon.classList.add('pending');
            break;
        case 'loading':
            icon.textContent = '🔄';
            icon.classList.add('loading');
            break;
        case 'completed':
            icon.textContent = '✅';
            icon.classList.add('completed');
            break;
        case 'error':
            icon.textContent = '❌';
            icon.classList.add('error');
            break;
    }
    
    // Update progress percentage
    updateProgressPercentage();
}

// Update progress percentage display
function updateProgressPercentage() {
    const progressItems = document.querySelectorAll('.progress-item');
    let completed = 0;
    let total = selectedModes.length;
    
    progressItems.forEach(item => {
        const mode = item.getAttribute('data-mode');
        if (selectedModes.includes(mode)) {
            const icon = item.querySelector('.progress-icon');
            if (icon && icon.classList.contains('completed')) {
                completed++;
            }
        }
    });
    
    if (total > 0) {
        const percentage = Math.round((completed / total) * 100);
        const progressContainer = document.getElementById('progressContainer');
        if (progressContainer) {
            // Remove existing percentage display
            const existing = progressContainer.querySelector('.progress-percentage');
            if (existing) {
                existing.remove();
            }
            
            // Add new percentage display
            const percentageEl = document.createElement('div');
            percentageEl.className = 'progress-percentage';
            percentageEl.style.cssText = 'text-align: center; margin-top: 10px; font-size: 16px; font-weight: 600; color: var(--primary);';
            percentageEl.textContent = `${completed} of ${total} completed (${percentage}%)`;
            progressContainer.appendChild(percentageEl);
        }
    }
}

// Global variable to track current tab index
let currentTabIndex = 0;
let availableTabs = [];

// Display results in tabbed interface
function displayResults() {
    const container = document.getElementById('resultsContainer');
    const tabsContainer = document.getElementById('resultsTabs');
    const contentContainer = document.getElementById('resultsContent');
    const tabNavArrows = document.getElementById('tabNavArrows');
    const successNextSteps = document.getElementById('successNextSteps');
    const decisionSnapshotCard = document.getElementById('decisionSnapshotCard');
    
    // Check if we have any results
    const hasResults = Object.keys(synthesisResults).some(mode => 
        synthesisResults[mode] && synthesisResults[mode].status === 'success'
    );
    
    if (!hasResults) {
        // No results yet - hide container and show nothing
        container.classList.remove('show');
        tabsContainer.innerHTML = '';
        contentContainer.innerHTML = '';
        if (tabNavArrows) tabNavArrows.style.display = 'none';
        if (successNextSteps) successNextSteps.style.display = 'none';
        if (decisionSnapshotCard) {
            decisionSnapshotCard.style.display = 'none';
            decisionSnapshotCard.innerHTML = '';
        }
        renderTrustLayerCard();
        return;
    }
    
    // Show container
    container.classList.add('show');
    renderDecisionSnapshotCard();
    renderTrustLayerCard();
    
    // Generate tabs only for modes that have been generated
    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';
    
    const modes = [
        { id: 'comprehensive', name: '📊 Comprehensive', icon: '📊', key: '1' },
        { id: 'executive', name: '👔 Executive', icon: '👔', key: '2' },
        { id: 'consensus', name: '🤝 Consensus', icon: '🤝', key: '3' },
        { id: 'divergence', name: '⚡ Divergence', icon: '⚡', key: '4' },
        { id: 'quality', name: '⭐ Quality', icon: '⭐', key: '5' },
        { id: 'improvement', name: '🔧 Improvement', icon: '🔧', key: '6' },
        { id: 'bestof', name: '🏆 Best-of-Best', icon: '🏆', key: '7' }
    ];
    
    // Filter to only show tabs for modes that have results
    availableTabs = modes.filter(mode => 
        synthesisResults[mode.id] && synthesisResults[mode.id].status === 'success'
    );
    
    // Create tabs only for modes with results
    availableTabs.forEach((mode, index) => {
        const tab = document.createElement('button');
        tab.className = `result-tab ${index === 0 ? 'active' : ''}`;
        tab.innerHTML = `${mode.icon} ${mode.name} <small style="opacity: 0.6; font-size: 11px;">(${mode.key})</small>`;
        tab.onclick = () => {
            currentTabIndex = index;
            showMode(mode.id, tab);
            updateTabNavigation();
        };
        tab.setAttribute('data-tab-index', index);
        tabsContainer.appendChild(tab);
    });
    
    // Show navigation arrows if we have multiple tabs
    if (tabNavArrows && availableTabs.length > 1) {
        tabNavArrows.style.display = 'flex';
        updateTabNavigation();
    } else if (tabNavArrows) {
        tabNavArrows.style.display = 'none';
    }
    
    // Show success next steps if all selected modes are complete
    const selectedCount = selectedModes.length;
    const completedCount = availableTabs.length;
    if (successNextSteps && selectedCount > 0 && completedCount >= selectedCount) {
        successNextSteps.style.display = 'block';
    }
    
    // Show first available mode if we have results
    if (availableTabs.length > 0) {
        currentTabIndex = 0;
        const firstTab = tabsContainer.querySelector('.result-tab');
        showMode(availableTabs[0].id, firstTab);
    }
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
}

// Update tab navigation arrows
function updateTabNavigation() {
    const prevBtn = document.getElementById('prevTab');
    const nextBtn = document.getElementById('nextTab');
    const tabCounter = document.getElementById('tabCounter');
    
    if (prevBtn) {
        prevBtn.disabled = currentTabIndex === 0;
    }
    if (nextBtn) {
        nextBtn.disabled = currentTabIndex >= availableTabs.length - 1;
    }
    if (tabCounter && availableTabs.length > 0) {
        tabCounter.textContent = `${currentTabIndex + 1} of ${availableTabs.length}`;
    }
}

// Navigate between tabs
function navigateTab(direction) {
    const newIndex = currentTabIndex + direction;
    if (newIndex >= 0 && newIndex < availableTabs.length) {
        currentTabIndex = newIndex;
        const tab = document.querySelector(`[data-tab-index="${newIndex}"]`);
        if (tab) {
            showMode(availableTabs[newIndex].id, tab);
            updateTabNavigation();
        }
    }
}

// Setup keyboard shortcuts (1-7 keys)
function setupKeyboardShortcuts() {
    // Remove existing listener to avoid duplicates
    document.removeEventListener('keydown', handleKeyboardShortcuts);
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

function handleKeyboardShortcuts(event) {
    // Only handle if not typing in an input/textarea
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
        return;
    }
    
    // Handle number keys 1-7
    const key = event.key;
    if (key >= '1' && key <= '7') {
        const index = parseInt(key) - 1;
        if (index < availableTabs.length) {
            // Find the mode ID for this index
            const modes = [
                'comprehensive', 'executive', 'consensus', 'divergence',
                'quality', 'improvement', 'bestof'
            ];
            const modeId = modes[index];
            
            // Check if this mode has results
            if (synthesisResults[modeId] && synthesisResults[modeId].status === 'success') {
                // Find the tab index in availableTabs
                const tabIndex = availableTabs.findIndex(tab => tab.id === modeId);
                if (tabIndex !== -1) {
                    currentTabIndex = tabIndex;
                    const tab = document.querySelector(`[data-tab-index="${tabIndex}"]`);
                    if (tab) {
                        showMode(modeId, tab);
                        updateTabNavigation();
                    }
                }
            }
        }
    }
    
    // Handle arrow keys for navigation
    if (event.key === 'ArrowLeft' && currentTabIndex > 0) {
        navigateTab(-1);
        event.preventDefault();
    } else if (event.key === 'ArrowRight' && currentTabIndex < availableTabs.length - 1) {
        navigateTab(1);
        event.preventDefault();
    }
}

// Show specific mode result
function showMode(modeId, clickedTab) {
    // Update active tab
    document.querySelectorAll('.result-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    if (clickedTab) {
        clickedTab.classList.add('active');
    } else {
        // Find tab by modeId
        const tab = document.querySelector(`[data-tab-index="${currentTabIndex}"]`);
        if (tab) {
            tab.classList.add('active');
        }
    }
    
    // Display content
    const contentContainer = document.getElementById('resultsContent');
    const result = synthesisResults[modeId];
    
    // Check if this mode has been generated
    if (!result || result.status !== 'success') {
        // Only show "Not Available" if user clicked a tab (not automatically)
        // This happens when user clicks on a mode button that hasn't been generated yet
        contentContainer.innerHTML = `
            <div class="error-result">
                <h3>❌ Analysis Not Available</h3>
                <p>This analysis mode has not been generated yet. Select it and click "Generate Analyses" to create it.</p>
            </div>
        `;
        return;
    }
    
    // Show the result
        contentContainer.innerHTML = formatResult(modeId, result.content);
}

// Format each mode differently
function formatResult(modeId, content) {
    const formatters = {
        comprehensive: formatComprehensive,
        executive: formatExecutive,
        consensus: formatConsensus,
        divergence: formatDivergence,
        quality: formatQuality,
        improvement: formatImprovement,
        bestof: formatBestOf
    };
    
    const formatter = formatters[modeId] || formatDefault;
    return formatter(content);
}

function formatComprehensive(content) {
    return `
        <div class="result-card comprehensive">
            <h3>📊 Comprehensive Analysis</h3>
            <div class="result-content markdown-content">${markdownToHtml(content)}</div>
        </div>
    `;
}

function sanitizeRenderedSynthesisText(text) {
    let sanitized = String(text || '');
    // Remove telemetry-style lines that can leak into model output.
    sanitized = sanitized
        .replace(/^\s*confidence band\s*:.*$/gim, '')
        .replace(/^\s*agreement signal\s*:.*$/gim, '')
        .replace(/^\s*trust layer signals?\s*:.*$/gim, '');
    // Remove markdown divider-only lines (---, ***, ___) to avoid visual noise.
    sanitized = sanitized.replace(/^\s*([-_*])\1{2,}\s*$/gm, '');
    // Normalize extra whitespace left after removals.
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n').trim();
    return sanitized;
}

function formatExecutive(content) {
    // Enhance executive summary formatting with better structure and spacing
    let enhancedContent = sanitizeRenderedSynthesisText(content);
    
    // Remove anxiety-heavy framing if model introduces it.
    enhancedContent = enhancedContent
        .replace(/critical compliance notice/gi, 'Trust Note')
        .replace(/not approved for deployment/gi, 'verification pending before production use')
        .replace(/not approved/gi, 'verification pending')
        .replace(/disqualifying for deployment/gi, 'requires additional quality review')
        .replace(/policy gate active/gi, 'verification gate active')
        .replace(/^winner\s*:/gmi, 'Synthesis focus:')
        .replace(/most business-ready answer/gi, 'synthesis perspective')
        .replace(/risk assessment of conflicting information/gi, 'model variation snapshot')
        .replace(/open points worth verifying/gi, 'context notes')
        .replace(/\boutlier\b/gi, 'notable variation')
        .replace(/\bconflict(s|ing)?\b/gi, 'variation$1');
    
    // Ensure proper section breaks for Executive Summary format
    // Replace multiple dashes/equals with proper headers if needed
    enhancedContent = enhancedContent.replace(/^[-=]{3,}$/gm, ''); // Remove separator lines
    
    // Normalize section headers - ensure consistent formatting
    enhancedContent = enhancedContent.replace(/^####\s*(Main Takeaways?:?)/gmi, '## $1');
    enhancedContent = enhancedContent.replace(/^####\s*(Most Business-Ready Answer?:?)/gmi, '## Synthesis Perspective');
    enhancedContent = enhancedContent.replace(/^####\s*(Risk Assessment)/gmi, '## Model Variation Snapshot');
    enhancedContent = enhancedContent.replace(/^####\s*(Recommended Actions?:?|Action Steps)/gmi, '## Synthesis Notes');
    
    // Ensure proper spacing between sections (double newline between major sections)
    enhancedContent = enhancedContent.replace(/(##\s+[^\n]+)\n([^\n#])/g, '$1\n\n$2');
    
    // Ensure bullet points have proper spacing
    enhancedContent = enhancedContent.replace(/^([\-\*]|\d+\.)\s+/gm, '- '); // Normalize to dashes
    
    return `
        <div class="result-card executive">
            <h3>👔 Executive Summary</h3>
            <div class="result-content markdown-content">${markdownToHtml(enhancedContent)}</div>
        </div>
    `;
}

function formatConsensus(content) {
    return `
        <div class="result-card consensus">
            <h3>🤝 Consensus Mapping</h3>
            <div class="result-content markdown-content">${markdownToHtml(content)}</div>
        </div>
    `;
}

function formatDivergence(content) {
    return `
        <div class="result-card divergence">
            <h3>⚡ Divergence Analysis</h3>
            <div class="result-content markdown-content">${markdownToHtml(content)}</div>
        </div>
    `;
}

function formatQuality(content) {
    console.log('📊 [formatQuality] Formatting Quality Scoring content...');
    console.log('📊 [formatQuality] Content length:', content?.length || 0);
    
    // Extract scores for visualization
    const scores = extractScores(content);
    console.log('📊 [formatQuality] Extracted scores:', scores.length, scores.map(s => `${s.ai}: ${s.overall}%`).join(', '));
    
    // Get comparison data for fallback
    const panes = comparisonData?.panes || [];
    const uniqueTools = new Map();
    panes.forEach(pane => {
        const toolName = pane.tool;
        if (toolName && !uniqueTools.has(toolName)) {
            uniqueTools.set(toolName, pane);
        }
    });
    const uniqueToolsArray = Array.from(uniqueTools.keys());
    
    // Always show the graph - use extracted scores if available, otherwise show from comparison data
    let scoresToDisplay = scores;
    if (scores.length === 0 && uniqueToolsArray.length > 0) {
        console.warn(`⚠️ [formatQuality] No scores extracted, creating default scores for ${uniqueToolsArray.length} tools`);
        // Create default scores from comparison data (will show 0% if no scores found)
        scoresToDisplay = uniqueToolsArray.map(tool => ({
            ai: tool,
            overall: 0
        }));
    }
    
    let scoreHTML = '';
    if (scoresToDisplay.length > 0) {
        scoreHTML = `
            <div class="quality-scores-graph" style="margin-bottom: 30px; padding: 20px; background: var(--surface); border-radius: 12px; border: 1px solid var(--border); box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <h4 style="margin-bottom: 20px; color: var(--text); font-size: 16px; font-weight: 600;">📊 Quality Scores Overview</h4>
                ${scoresToDisplay.map(score => {
                    const displayScore = score.overall || 0;
                    const hasScore = score.overall > 0;
                    return `
                    <div class="score-row" style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px; padding: 12px; background: var(--background); border-radius: 8px; ${!hasScore ? 'opacity: 0.7;' : ''}">
                        <span class="score-label" style="min-width: 100px; font-weight: 500; color: var(--text); font-size: 14px;">${score.ai}</span>
                        <div class="score-bar" style="flex-grow: 1; height: 24px; background: var(--surface-light); border-radius: 12px; overflow: hidden; position: relative; border: 1px solid var(--border);">
                            <div class="score-fill" style="height: 100%; background: ${hasScore ? 'linear-gradient(90deg, #22c55e 0%, #10b981 50%, #3b82f6 100%)' : 'var(--border)'}; border-radius: 12px; transition: width 0.5s ease; width: ${displayScore}%; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px; box-shadow: ${hasScore ? 'inset 0 1px 2px rgba(0,0,0,0.1)' : 'none'};">
                                ${hasScore ? `<span style="color: white; font-size: 11px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">${displayScore}%</span>` : ''}
                        </div>
                    </div>
                        <span class="score-value" style="min-width: 80px; text-align: right; font-weight: 600; color: ${hasScore ? 'var(--text)' : 'var(--text-secondary)'}; font-size: 14px;">${hasScore ? `${displayScore}/100` : '--/100'}</span>
            </div>
        `;
                }).join('')}
            </div>
        `;
        console.log(`✅ [formatQuality] Generated score graph with ${scoresToDisplay.length} entries`);
    } else {
        console.warn('⚠️ [formatQuality] No scores to display - neither extracted scores nor comparison data available');
    }
    
    return `
        <div class="result-card quality">
            <h3>⭐ Quality Scoring</h3>
            ${scoreHTML || '<p style="color: var(--text-secondary); padding: 20px;">Score graph will appear here once analysis is complete.</p>'}
            <div class="result-content markdown-content" style="margin-top: 20px;">${markdownToHtml(content)}</div>
        </div>
    `;
}

function formatBestOf(content) {
    const panes = comparisonData.panes || [];
    // Deduplicate by tool name to get unique AI tools only
    const uniqueTools = new Set();
    panes.forEach(pane => {
        if (pane.tool) {
            uniqueTools.add(pane.tool);
        }
    });
    const aiNames = Array.from(uniqueTools).join(', ');
    
    const cleanContent = sanitizeRenderedSynthesisText(content);
    return `
        <div class="result-card bestof">
            <h3>🏆 ${isFocusedSynthesis ? 'Your Final Answer' : 'Your Decision Synthesis'}</h3>
            <div class="bestof-badge">${isFocusedSynthesis ? '🔥 Forged from all perspectives' : '🏆 Consolidated from all perspectives'}</div>
            <div class="result-content markdown-content">${markdownToHtml(cleanContent)}</div>
            <div class="bestof-source">
                <small>Synthesized from: ${aiNames}</small>
            </div>
        </div>
    `;
}

function formatImprovement(content) {
    return `
        <div class="result-card improvement">
            <h3>🔧 Improvement Guide</h3>
            <div class="result-content markdown-content">${markdownToHtml(content)}</div>
        </div>
    `;
}

function formatDefault(content) {
    const cleanContent = sanitizeRenderedSynthesisText(content);
    return `
        <div class="result-card">
            <div class="result-content markdown-content">${markdownToHtml(cleanContent)}</div>
        </div>
    `;
}

// Extract scores from content for visualization
function extractScores(content) {
    const scores = [];
    const panes = comparisonData?.panes || [];
    
    if (!panes || panes.length === 0) {
        console.warn('⚠️ [extractScores] No comparison data panes available');
        return scores;
    }
    
    // Deduplicate by tool name to get unique AI tools only
    const uniqueTools = new Map();
    panes.forEach(pane => {
        const toolName = pane.tool;
        if (toolName && !uniqueTools.has(toolName)) {
            uniqueTools.set(toolName, pane);
        }
    });
    
    const uniqueToolsArray = Array.from(uniqueTools.values());
    
    if (uniqueToolsArray.length === 0) {
        console.warn('⚠️ [extractScores] No unique tools found in comparison data');
        return scores;
    }
    
    console.log(`📊 [extractScores] Attempting to extract scores for ${uniqueToolsArray.length} unique tools: ${uniqueToolsArray.map(p => p.tool).join(', ')}`);
    
    // Try to find score patterns in the content - only for unique tools
    uniqueToolsArray.forEach(pane => {
        const aiName = pane.tool;
        let overallScore = null;
        
        // First, try to find the section for this AI tool (e.g., "**Gemini Response:**" or "Gemini Response:")
        // Match both markdown and plain text formats, including OpenAI's format variations
        const aiSectionPatterns = [
            new RegExp(`(?:\\*\\*)?${aiName}\\s*Response[^]*?(?=\\*\\*[A-Z][a-z]+\\s+Response|$)`, 'i'),
            new RegExp(`${aiName}\\s*Response[^]*?(?=\\n\\n|\\n\\*\\*[A-Z]|$)`, 'i'),
            new RegExp(`${aiName}[^]*?(?:Response|response)[^]*?(?=${aiName}|$)`, 'i'),
            new RegExp(`${aiName}[^]*?(?=\\*\\*[A-Z]|$)`, 'i'),
            // OpenAI sometimes uses "For [AI_NAME]:" format
            new RegExp(`For\\s+${aiName}[^]*?(?=For\\s+[A-Z]|$)`, 'i'),
            // Fallback: just find text mentioning this AI name followed by scores
            new RegExp(`${aiName}[^]{50,1000}(?=${aiName}|$)`, 'i'),
        ];
        
        let sectionContent = content;
        for (const pattern of aiSectionPatterns) {
            const match = content.match(pattern);
            if (match && match[0] && match[0].length > 50) {
                sectionContent = match[0];
                console.log(`🔍 [extractScores] Found section for ${aiName} (${sectionContent.length} chars)`);
                console.log(`📝 [extractScores] Section preview: "${sectionContent.substring(0, 150)}..."`);
                break;
            }
        }
        
        // If no section found, search entire content for scores near AI name mentions
        if (sectionContent === content) {
            console.log(`⚠️ [extractScores] No dedicated section found for ${aiName}, searching entire content`);
        }
        
        // Method 1: Calculate average from individual criteria scores (most reliable)
        // Look for patterns like: "**Accuracy:** 95" or "1. **Accuracy:** 95" or "Accuracy: 95" or "Accuracy Score: 95"
        // Use more flexible patterns that handle markdown formatting, OpenAI format, and various separators
        const individualScores = [];
        const criteriaPatterns = [
            // More flexible patterns to catch various formats
            { name: 'Accuracy', pattern: /(?:Accuracy|accuracy)\s*(?:Score)?\s*:?\s*[\*\-\s]*(\d{1,3})(?:\s*[\/\-]\s*\d+)?(?:\s|$|,|\.|\))/i },
            { name: 'Clarity', pattern: /(?:Clarity|clarity)\s*(?:Score)?\s*:?\s*[\*\-\s]*(\d{1,3})(?:\s*[\/\-]\s*\d+)?(?:\s|$|,|\.|\))/i },
            { name: 'Depth/Completeness', pattern: /(?:Depth\s*\/?\s*Completeness|Depth\/completeness|Depth[\*\s]*\/[\*\s]*Completeness)\s*(?:Score)?\s*:?\s*[\*\-\s]*(\d{1,3})(?:\s*[\/\-]\s*\d+)?(?:\s|$|,|\.|\))/i },
            { name: 'Depth', pattern: /(?:^|[^\/])(?:Depth|depth)\s*(?:Score)?\s*:?\s*[\*\-\s]*(\d{1,3})(?:\s*[\/\-]\s*\d+)?(?:\s|$|,|\.|\))/i },
            { name: 'Completeness', pattern: /(?:^|[^\/])(?:Completeness|completeness)\s*(?:Score)?\s*:?\s*[\*\-\s]*(\d{1,3})(?:\s*[\/\-]\s*\d+)?(?:\s|$|,|\.|\))/i },
            { name: 'Practicality', pattern: /(?:Practicality|practicality)\s*(?:Score)?\s*:?\s*[\*\-\s]*(\d{1,3})(?:\s*[\/\-]\s*\d+)?(?:\s|$|,|\.|\))/i },
        ];
        
        criteriaPatterns.forEach(({ name, pattern }) => {
            const match = sectionContent.match(pattern);
            if (match && match[1]) {
                const score = parseInt(match[1]);
                if (score > 0 && score <= 100) {
                    // Avoid duplicates (e.g., if both "Depth" and "Depth/Completeness" match)
                    if (!individualScores.find(s => s.name === name || (name.includes('Depth') && s.name.includes('Depth')))) {
                        individualScores.push({ name, score });
                        console.log(`  ✓ Found ${name} score for ${aiName}: ${score} (from: "${match[0].substring(0, 50)}...")`);
                    }
                } else {
                    console.warn(`  ⚠️ Invalid score for ${name} (${aiName}): ${score} (must be 1-100)`);
                }
            } else {
                // Debug: log what we're looking for vs what we found
                const sample = sectionContent.substring(0, 200);
                if (sample.toLowerCase().includes(name.toLowerCase())) {
                    console.log(`  🔍 Looking for ${name} in "${sample}..." but pattern didn't match`);
                }
            }
        });
        
        if (individualScores.length > 0) {
            const scoresList = individualScores.map(s => s.score);
            overallScore = Math.round(scoresList.reduce((a, b) => a + b, 0) / scoresList.length);
            console.log(`✅ [extractScores] Calculated average score for ${aiName}: ${overallScore}% (from ${individualScores.length} criteria: ${scoresList.join(', ')})`);
        }
        
        // Method 2: Look for "Overall grade" with grade letter (if average wasn't calculated)
        if (!overallScore) {
            const gradePatterns = [
                /Overall[\*\s]*grade[\*\s]*:?[\*\s]*([A-F][+-]?)(?:\s|$|[\*\s\-])/i,
                /Overall[\*\s]*grade[\*\s]*:?[\*\s]*([A-F][+-]?)/i,
                /(?:5\.|5\s)[\*\s]*Overall[\*\s]*grade[\*\s]*:?[\*\s]*([A-F][+-]?)/i,
            ];
            
            for (const pattern of gradePatterns) {
                const match = sectionContent.match(pattern);
                if (match && match[1]) {
                    const grade = match[1].toUpperCase().trim();
                    const gradeMap = {
                        'A+': 98, 'A': 95, 'A-': 92,
                        'B+': 88, 'B': 85, 'B-': 82,
                        'C+': 78, 'C': 75, 'C-': 72,
                        'D+': 68, 'D': 65, 'D-': 62,
                        'F': 50
                    };
                    overallScore = gradeMap[grade] || null;
                    if (overallScore) {
                        console.log(`✅ [extractScores] Found grade for ${aiName}: ${grade} = ${overallScore}%`);
                        break;
                    }
                }
            }
        }
        
        // Method 3: Look for explicit overall score number (fallback)
        if (!overallScore) {
            const overallPatterns = [
                /Overall[\*\s]*:?[\*\s]*(\d+)[\*\s]*\/[\*\s]*(\d+)/i,
                /Overall[\*\s]*:?[\*\s]*(\d+)/i,
                /(\d+)[\*\s]*\/[\*\s]*(\d+)[\*\s]*Overall/i,
            ];
            
            for (const pattern of overallPatterns) {
                const match = sectionContent.match(pattern);
                if (match && match[1]) {
                    const score = parseInt(match[1]);
                    const max = match[2] ? parseInt(match[2]) : 100;
                    if (score > 0) {
                        overallScore = Math.round((score / max) * 100);
                        console.log(`✅ [extractScores] Found overall score for ${aiName}: ${overallScore}% (${score}/${max})`);
                        break;
                    }
                }
            }
        }
        
        // If we found a score, add it
        if (overallScore && overallScore > 0) {
            if (!scores.find(s => s.ai === aiName)) {
            scores.push({
                ai: aiName,
                    overall: Math.min(100, Math.max(0, overallScore)) // Ensure 0-100 range
            });
            }
        } else {
            console.warn(`⚠️ [extractScores] Could not extract score for ${aiName} - no patterns matched`);
        }
    });
    
    // Final deduplication: Keep only the highest score for each unique tool
    const seenTools = new Map();
    scores.forEach(score => {
        const existingScore = seenTools.get(score.ai);
        if (!existingScore || score.overall > existingScore.overall) {
            seenTools.set(score.ai, score);
        }
    });
    
    // Convert map back to array and sort by score (highest first)
    const finalScoresArray = Array.from(seenTools.values());
    finalScoresArray.sort((a, b) => b.overall - a.overall);
    
    console.log(`📊 [extractScores] Final result: ${finalScoresArray.length} unique tool scores extracted:`, finalScoresArray.map(s => `${s.ai}: ${s.overall}%`).join(', '));
    
    return finalScoresArray;
}


// Synthesis Engine Class
class SynthesisEngine {
    constructor(comparisonData) {
        this.data = comparisonData;
        this.results = {};
        this.prompts = this.generatePrompts();
        // Track last API call info for usage tracking
        this.lastUsedProvider = null;
        this.lastUsedModel = null;
        this.lastUsedFallback = false;
    }
    
    // Helper function: Get user tier from Electron API
    async getUserTier() {
        try {
            if (window.electronAPI && window.electronAPI.getSubscription) {
                const subscription = await window.electronAPI.getSubscription();
                return subscription?.tier || 'starter';
            }
        } catch (e) {
            console.warn('⚠️ [Synthesis] Could not get user tier:', e);
        }
        return 'starter'; // Default to starter (free tier)
    }

    async getCurrentUserKey() {
        try {
            if (window.electronAPI && window.electronAPI.getCurrentUser) {
                const response = await window.electronAPI.getCurrentUser();
                if (response && response.success && response.user) {
                    return response.user.userId || response.user.email || 'public';
                }
            }
        } catch (error) {
            console.warn('⚠️ [Synthesis] Could not get current user key:', error);
        }
        return 'public';
    }
    
    // Generate 7 different prompt templates
    generatePrompts() {
        const panes = this.data.panes || [];
        const trustContext = buildTrustPromptContext(this.data.trustLayer);
        const responsesText = panes.map(pane => {
            const content = pane.response || pane.content || pane.html || '';
            return `=== ${pane.tool} ===\n${content}\n`;
        }).join('\n');
        
        return {
            comprehensive: `Create a synthesis-only comparison of these AI responses and provide:
1. Shared core points across responses
2. Key differences in approach and wording
3. Notable strengths by response (descriptive, not ranked)
4. Gaps or ambiguities that appear across responses
5. A neutral integrated synthesis summary

Trust Layer Signals:\n${trustContext}\n\nResponses:\n${responsesText}`,
            
            executive: `Create a synthesis-first executive summary comparing these AI responses.
Style requirements:
- Keep tone calm, clear, and decision-oriented
- Lead with the best combined answer first (2-5 sentences when needed)
- Do not sound like a compliance/audit report
- Do not give advice, prescriptions, or verdicts
- Avoid alarmist/legal language unless explicitly required
- Do not use heavy risk/compliance tables by default
- Prefer language such as "variation", "context", and "alignment" over "risk", "conflict", or "disqualifying"
- Be concise when possible, comprehensive when necessary
- Preserve important nuance and reasoning if it improves decision quality
- Target depth: usually 2-4 short paragraphs plus bullets, not a one-paragraph response

Include:
- Main takeaways (clear bullet points)
- Neutral synthesis of the most complete combined answer
- Brief differences in framing among models
- Open points that may benefit from additional verification

Important:
- We are synthesizing model outputs, not giving professional advice or judgments.
- Keep wording neutral and non-prescriptive.
- When models disagree, briefly explain the disagreement and provide the most reliable synthesized conclusion.

Trust Layer Signals:\n${trustContext}\n\nResponses:\n${responsesText}`,
            
            consensus: `Analyze these AI responses for consensus:
1. List all points where 2+ AIs agree
2. Identify the strongest consensus areas
3. Note any surprising agreements
4. Calculate agreement percentage

Trust Layer Signals:\n${trustContext}\n\nResponses:\n${responsesText}`,
            
            divergence: `Analyze divergences in these AI responses:
1. Major variation points
2. Why these divergences might exist
3. How these divergences change interpretation
4. Neutral reconciliation of differences into one synthesized perspective

Trust Layer Signals:\n${trustContext}\n\nResponses:\n${responsesText}`,
            
            quality: `Evaluate these AI responses with objective quality signals:

For EACH AI response, provide scores in this EXACT format:
**AI_NAME Response:**
- **Accuracy:** [0-100] - [brief justification]
- **Clarity:** [0-100] - [brief justification]
- **Depth/Completeness:** [0-100] - [brief justification]
- **Practicality:** [0-100] - [brief justification]
- **Overall Grade:** [A-F]

IMPORTANT: Use the EXACT format "Accuracy: [number]", "Clarity: [number]", etc. Include the colon and space. Scores must be integers 0-100.

Trust Layer Signals:\n${trustContext}\n\nResponses:\n${responsesText}`,
            
            improvement: `Provide neutral refinement notes for each AI response:
For each AI:
1. 3 concise refinement opportunities
2. What is missing or unclear
3. What is overly verbose or redundant
4. How clarity can be improved without changing intent

Trust Layer Signals:\n${trustContext}\n\nResponses:\n${responsesText}`,
            
            bestof: `Synthesize one integrated answer by combining the strongest parts of all responses:
1. Start with a concise direct answer (2-5 sentences when needed)
2. Summarize key insights synthesized across models
3. Include brief explanation where it clarifies reasoning or nuance
4. Preserve important caveats without advisory tone
5. If models disagree, briefly explain the difference and synthesize the most reliable combined conclusion
6. Create a cohesive, improved final answer
7. Provide enough detail to be practically useful; avoid under-explained summaries

DO NOT just concatenate. Create a new, superior response.
Do not include "winner", "best model", or prescriptive action directives.
Avoid unnecessary verbosity, but do not omit important evidence or nuance.

Trust Layer Signals:\n${trustContext}\n\nResponses:\n${responsesText}`
        };
    }
    
    // Run all 7 analyses in parallel
    async runAllAnalyses() {
        const modes = Object.keys(this.prompts);
        
        // Create promises for all 7 modes
        const promises = modes.map(async (mode) => {
            try {
                updateProgress(mode, 'loading');
                const result = await this.callOpenAI(this.prompts[mode], mode);
                this.results[mode] = {
                    content: result,
                    timestamp: new Date().toISOString(),
                    status: 'success'
                };
                updateProgress(mode, 'completed');
                return { mode, success: true };
            } catch (error) {
                // Use user-friendly error message (already set by callOpenAI)
                const errorMessage = error?.message || error?.originalError || String(error) || 'Unknown error occurred';
                const friendlyError = error?.message || this.getUserFriendlyError(error, mode);
                
                console.error(`❌ Error in ${mode}:`, errorMessage);
                console.error(`📋 User-friendly message:`, friendlyError);
                
                this.results[mode] = {
                    content: `## Error Generating ${mode.charAt(0).toUpperCase() + mode.slice(1)} Analysis\n\n${friendlyError}\n\n**Technical details:** ${errorMessage}`,
                    timestamp: new Date().toISOString(),
                    status: 'error',
                    error: errorMessage,
                    friendlyError: friendlyError
                };
                updateProgress(mode, 'error');
                return { mode, success: false, error: errorMessage, friendlyError: friendlyError };
            }
        });
        
        // Wait for all to complete
        await Promise.allSettled(promises);
        
        return this.results;
    }
    
    // Run only selected modes, with caching (skip already generated)
    async runSelectedAnalyses(selectedModes, existingResults = {}) {
        const results = {};
        const cachedModes = [];
        const modesToGenerate = [];
        
        // Separate modes into cached and needs-generation
        selectedModes.forEach(mode => {
            const existing = existingResults[mode];
            if (existing && existing.status === 'success' && existing.content) {
                console.log(`[Synthesis] Skipping ${mode} - already generated`);
                // Use existing result
                results[mode] = existing;
                cachedModes.push(mode);
                updateProgress(mode, 'completed');
            } else {
                modesToGenerate.push(mode);
            }
        });
        
        if (modesToGenerate.length === 0) {
            console.log('📦 [Synthesis] All selected modes already generated, using cache (no API calls needed)');
            console.log('📦 [Synthesis] Cached modes:', cachedModes);
            return results;
        }
        
        console.log(`🚀 [Synthesis] Generating ${modesToGenerate.length} ${modesToGenerate.length === 1 ? 'mode' : 'modes'} via API:`, modesToGenerate);
        console.log(`📦 [Synthesis] Using cache for ${cachedModes.length} ${cachedModes.length === 1 ? 'mode' : 'modes'}:`, cachedModes);
        
        // Check usage limits before generating (NEW: Ultra-generous free tier implementation)
        const userTier = await this.getUserTier();
        const userKey = await this.getCurrentUserKey();
        console.log(`👤 [Synthesis] User tier: ${userTier}`);
        
        // Check if user can generate more syntheses
        if (typeof window !== 'undefined' && window.SynthesisUsageTracker) {
            const canGenerate = window.SynthesisUsageTracker.canGenerate(userTier, userKey);
            if (!canGenerate.allowed) {
                const stats = window.SynthesisUsageTracker.getStatistics(userTier, userKey);
                const errorMsg = `Monthly synthesis limit reached (${stats.used}/${stats.limit}). Upgrade to Creator for 100 syntheses/month or wait until ${new Date(stats.resetDate).toLocaleDateString()}.`;
                console.error(`❌ [Synthesis] Usage limit reached:`, errorMsg);
                
                // Update UI to show limit reached
                const button = document.getElementById('runSynthesis');
                if (button) {
                    button.disabled = false;
                    button.textContent = 'Limit Reached - Upgrade Now';
                }
                
                throw new Error(errorMsg);
            }
            
            // Show warning if approaching limit (80% threshold)
            if (canGenerate.reason === 'approaching_limit') {
                const stats = window.SynthesisUsageTracker.getStatistics(userTier, userKey);
                console.warn(`⚠️ [Usage] Approaching limit: ${stats.used}/${stats.limit} (${stats.percentage}%)`);
                
                // Optionally show non-intrusive toast notification
                if (typeof showToast === 'function') {
                    showToast(`⚠️ You've used ${stats.used} of ${stats.limit} syntheses this month (${stats.percentage}%). Consider upgrading for more.`, 5000);
                }
            }
        } else {
            console.warn('⚠️ [Synthesis] SynthesisUsageTracker not loaded - skipping usage check');
        }
        
        // Create promises for modes that need generation
        const promises = modesToGenerate.map(async (mode) => {
            try {
                updateProgress(mode, 'loading');
                const result = await this.callOpenAI(this.prompts[mode], mode);
                
                // Extract model info from class properties (stored during callOpenAI)
                const modelUsed = this.lastUsedModel || (userTier === 'starter' ? 'claude-haiku' : 'claude-sonnet-4');
                const providerUsed = this.lastUsedProvider || 'claude';
                const usedFallbackFlag = this.lastUsedFallback || false;
                
                results[mode] = {
                    content: result,
                    timestamp: new Date().toISOString(),
                    status: 'success',
                    provider: providerUsed,
                    model: modelUsed,
                    usedFallback: usedFallbackFlag
                };
                updateProgress(mode, 'completed');
                
                // Track usage after successful generation (NEW: Ultra-generous free tier implementation)
                if (typeof window !== 'undefined' && window.SynthesisUsageTracker) {
                    try {
                        window.SynthesisUsageTracker.increment(
                            userTier,
                            mode, // framework type
                            modelUsed, // model used (claude-haiku, claude-sonnet-4, gpt-3.5-turbo, gpt-4-turbo)
                            { 
                                timestamp: new Date().toISOString(),
                                provider: providerUsed,
                                model: modelUsed,
                                usedFallback: usedFallbackFlag,
                                tier: userTier
                            },
                            userKey
                        );
                        console.log(`📊 [Usage] Tracked synthesis: ${mode} using ${providerUsed} ${modelUsed} ${usedFallbackFlag ? '(fallback)' : '(primary)'} (tier: ${userTier})`);
                        
                        // Update usage widget if it exists
                        if (typeof updateUsageWidget === 'function') {
                            updateUsageWidget();
                        }
                    } catch (trackError) {
                        console.error('❌ [Usage] Error tracking usage:', trackError);
                        // Don't fail synthesis if tracking fails
                    }
                }
                
                return { mode, success: true, provider: providerUsed, model: modelUsed };
            } catch (error) {
                // Handle both Error objects and plain error objects from IPC
                const errorMessage = error?.message || error?.originalError || error?.error || String(error) || 'Unknown error occurred';
                const friendlyError = error?.message || this.getUserFriendlyError(error, mode);
                
                console.error(`❌ Error in ${mode}:`, errorMessage, error);
                console.error(`📋 User-friendly message:`, friendlyError);
                
                results[mode] = {
                    content: `## Error Generating ${mode.charAt(0).toUpperCase() + mode.slice(1)} Analysis\n\n${friendlyError}\n\n**Technical details:** ${errorMessage}`,
                    timestamp: new Date().toISOString(),
                    status: 'error',
                    error: errorMessage,
                    friendlyError: friendlyError
                };
                updateProgress(mode, 'error');
                return { mode, success: false, error: errorMessage, friendlyError: friendlyError };
            }
        });
        
        // Wait for all to complete
        await Promise.allSettled(promises);
        
        return results;
    }
    
    // Helper function: Retry logic with exponential backoff for API calls
    async callAPIWithRetry(fn, mode, options = {}) {
        const maxRetries = options.maxRetries || 3;
        const initialDelay = options.initialDelay || 1000;
        const timeout = options.timeout || 60000; // 60 seconds for OpenAI API
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Wrap API call with timeout
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`API call timed out after ${timeout/1000}s`)), timeout)
                );
                
                const result = await Promise.race([fn(), timeoutPromise]);
                
                if (attempt > 0) {
                    console.log(`✅ [Retry] ${mode} API call succeeded on attempt ${attempt + 1}/${maxRetries}`);
                }
                return result;
            } catch (error) {
                const errorMsg = error?.message || error?.error || String(error) || 'Unknown error';
                
                // Determine if error is retryable
                const isRetryable = errorMsg.includes('timeout') || 
                                   errorMsg.includes('network') ||
                                   errorMsg.includes('ECONNREFUSED') ||
                                   errorMsg.includes('ETIMEDOUT') ||
                                   errorMsg.includes('429') || // Rate limit
                                   errorMsg.includes('503') || // Service unavailable
                                   errorMsg.includes('502') || // Bad gateway
                                   error.code === 'ETIMEDOUT' ||
                                   error.status === 429 ||
                                   error.status === 503 ||
                                   error.status === 502;
                
                if (!isRetryable || attempt === maxRetries - 1) {
                    // Don't retry non-retryable errors or if we've exhausted retries
                    if (attempt === maxRetries - 1) {
                        console.error(`❌ [Retry] ${mode} API call failed after ${maxRetries} attempts:`, errorMsg);
                    }
                    throw error;
                }
                
                // Exponential backoff: 1s, 2s, 4s
                const delay = initialDelay * Math.pow(2, attempt);
                console.log(`⏳ [Retry] ${mode} API call failed (attempt ${attempt + 1}/${maxRetries}): ${errorMsg}`);
                console.log(`⏳ [Retry] Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // Get user-friendly error message for OpenAI API
    getUserFriendlyError(error, mode) {
        const errorMsg = error?.message || error?.error || String(error) || 'Unknown error';
        
        if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
            return `The ${mode} analysis timed out. This may be due to the prompt being too complex or network issues. Please try again with a shorter prompt.`;
        }
        
        if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
            return `OpenAI API rate limit exceeded. Please wait a moment and try again. If this persists, consider upgrading your plan.`;
        }
        
        if (errorMsg.includes('401') || errorMsg.includes('invalid') || errorMsg.includes('authentication')) {
            return `OpenAI API authentication failed. Please check your API key in settings.`;
        }
        
        if (errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ETIMEDOUT')) {
            return `Network connectivity issue. Please check your internet connection and try again.`;
        }
        
        if (errorMsg.includes('503') || errorMsg.includes('502') || errorMsg.includes('service unavailable')) {
            return `OpenAI API is temporarily unavailable. Please try again in a few moments.`;
        }
        
        if (errorMsg.includes('quota') || errorMsg.includes('billing')) {
            return `OpenAI API quota exceeded. Please check your billing status or upgrade your plan.`;
        }
        
        // Generic error message
        return `Failed to generate ${mode} analysis: ${errorMsg}. Please try again or contact support if the issue persists.`;
    }
    
    // Call Synthesis API (Claude primary + OpenAI fallback) via Electron main process
    async callOpenAI(prompt, mode) {
        const userTier = await this.getUserTier();
        const isFreeTier = userTier === 'starter' || userTier === 'unregistered' || userTier === 'free';
        
        console.log(`🤖 [Synthesis API] Preparing API call for mode: ${mode} (Tier: ${userTier})`);
        const systemPrompt = this.getSystemPrompt(mode);
        const temperature = this.getTemperatureForMode(mode);
        const maxTokens = this.getTokenLimitForMode(mode);
        
        // Determine model based on tier (will be used by unified API handler)
        // LAUNCH CONFIG: Using Haiku for all tiers (confirmed working perfectly)
        // Differentiated by max_tokens: 4096 for free, 8192 for paid
        const claudeModel = 'claude-3-5-haiku-latest'; // Keep request aligned with currently available Anthropic aliases
        const openAIModel = isFreeTier ? 'gpt-4o-mini' : 'gpt-4o';
        
        console.log(`🎯 [Synthesis API] Primary: Claude ${claudeModel}`);
        console.log(`🔄 [Synthesis API] Fallback: OpenAI ${openAIModel}`);
        
        const requestData = {
            tier: userTier,
            mode: mode,
            model: claudeModel, // Primary model (Claude)
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: temperature,
            max_tokens: maxTokens
        };
        
        // Call via Electron API (uses unified synthesis API with Claude primary + OpenAI fallback)
        if (!window.electronAPI) {
            console.error('❌ [Synthesis API] Electron API not available');
            throw new Error('API not available. Please restart the application.');
        }
        
        // Use unified synthesis API if available, otherwise fall back to OpenAI
        const apiCallFunction = window.electronAPI.callSynthesisAPI || window.electronAPI.callOpenAI;
        
        if (!apiCallFunction) {
            console.error('❌ [Synthesis API] No API method available');
            throw new Error('API not available. Please restart the application.');
        }
        
        console.log(`🚀 [Synthesis API] Making API call for ${mode}...`);
        console.log(`📊 [Synthesis API] Request data:`, {
            tier: userTier,
            primaryModel: claudeModel,
            fallbackModel: openAIModel,
            messagesCount: requestData.messages.length,
            temperature: requestData.temperature,
            max_tokens: requestData.max_tokens
        });
        
        try {
            // Call unified API with retry logic and timeout
            const result = await this.callAPIWithRetry(
                async () => {
                    // Use unified synthesis API (Claude primary + OpenAI fallback)
                    if (window.electronAPI.callSynthesisAPI) {
                        return await window.electronAPI.callSynthesisAPI(requestData);
        } else {
                        // Fallback to OpenAI only (legacy support)
                        console.warn('⚠️ [Synthesis API] Unified API not available, using OpenAI only');
                        return await window.electronAPI.callOpenAI({
                            ...requestData,
                            model: openAIModel
                        });
                    }
                },
                mode,
                {
                    maxRetries: 3,
                    initialDelay: 1000,
                    timeout: 60000 // 60 seconds for API calls
                }
            );
            
            const provider = result.provider || 'unknown';
            const model = result.model || 'unknown';
            const usedFallback = result.usedFallback || false;
            
            console.log(`📥 [Synthesis API] API response received for ${mode}:`, {
                provider: provider,
                model: model,
                usedFallback: usedFallback,
                success: result.success,
                hasError: !!result.error,
                hasResult: !!result.result,
                hasChoices: !!(result.result && result.result.choices && result.result.choices.length > 0)
            });
            
            if (usedFallback) {
                console.warn(`⚠️ [Synthesis API] Used fallback provider (${provider}) - Claude API may have failed`);
            } else {
                console.log(`✅ [Synthesis API] Used primary provider (${provider} ${model})`);
            }
            
            if (result.success && result.result && result.result.choices && result.result.choices.length > 0) {
                const content = result.result.choices[0].message.content;
                const providerUsed = result.provider || provider || 'claude';
                const modelUsed = result.model || model || (isFreeTier ? 'claude-3-5-haiku-latest' : 'claude-3-5-sonnet-latest');
                const usedFallbackFlag = result.usedFallback || usedFallback || false;
                
                // Convert model name to simplified format for usage tracking
                let modelNameForTracking = modelUsed;
                if (modelUsed.includes('claude-3-5-haiku') || modelUsed.includes('haiku')) {
                    modelNameForTracking = 'claude-haiku';
                } else if (modelUsed.includes('claude-3-5-sonnet') || modelUsed.includes('claude-sonnet-4') || modelUsed.includes('sonnet')) {
                    modelNameForTracking = 'claude-sonnet';
                } else if (modelUsed.includes('gpt-4o-mini')) {
                    modelNameForTracking = 'gpt-4o-mini';
                } else if (modelUsed.includes('gpt-4o')) {
                    modelNameForTracking = 'gpt-4o';
                } else if (modelUsed.includes('gpt-4')) {
                    modelNameForTracking = 'gpt-4';
                } else if (modelUsed.includes('gpt-3.5')) {
                    modelNameForTracking = 'gpt-3.5-turbo';
                }
                
                console.log(`✅ [Synthesis API] Successfully received response for ${mode} from ${providerUsed} ${modelUsed} ${usedFallbackFlag ? '(fallback)' : '(primary)'} (${content.length} characters)`);
                
                // Store provider info for usage tracking (used after callOpenAI returns)
                this.lastUsedProvider = providerUsed;
                this.lastUsedModel = modelNameForTracking; // Store simplified model name
                this.lastUsedFallback = usedFallbackFlag;
                
                return content;
            } else {
                // Extract error message from result object
                const errorMsg = result?.error || result?.message || 'Unknown error occurred';
                const friendlyError = this.getUserFriendlyError({ message: errorMsg }, mode);
                console.error(`❌ [Synthesis API] API call failed for ${mode}:`, errorMsg);
                console.error(`📋 [Synthesis API] User-friendly message:`, friendlyError);
                
                const error = new Error(friendlyError);
                error.originalError = errorMsg;
                error.provider = provider;
                throw error;
            }
        } catch (error) {
            // If error doesn't have a user-friendly message, add one
            if (!error.message || error.message === error.originalError) {
                const friendlyError = this.getUserFriendlyError(error, mode);
                console.error(`❌ [Synthesis API] API call error for ${mode}:`, error.message || error.originalError || 'Unknown error');
                console.error(`📋 [Synthesis API] User-friendly message:`, friendlyError);
                
                const friendlyErrorObj = new Error(friendlyError);
                friendlyErrorObj.originalError = error.message || error.originalError || String(error);
                friendlyErrorObj.provider = error.provider || 'unknown';
                throw friendlyErrorObj;
            }
            throw error;
        }
    }
    
    // System prompts for each mode
    getSystemPrompt(mode) {
        const prompts = {
            comprehensive: 'You are an expert synthesis analyst. Provide a comprehensive, balanced synthesis comparing multiple AI responses. Be specific, evidence-aware, and neutral.',
            executive: 'You are a synthesis editor. Create clear executive summaries that prioritize direct answers, key insights, and neutral comparison over recommendations.',
            consensus: 'You are a data analyst specializing in finding agreement patterns. Identify consensus objectively.',
            divergence: 'You analyze viewpoint variation. Explain why differences exist and how they affect interpretation in a neutral tone.',
            quality: 'You are a quality assurance expert. Score responses objectively with specific criteria and evidence.',
            improvement: 'You are a refinement analyst. Provide specific, neutral refinement notes without prescribing actions.',
            bestof: 'You are a master synthesis editor. Combine the strongest elements into one clear, neutral integrated response that remains concise-first but preserves important nuance.'
        };
        
        return prompts[mode] || 'Provide helpful analysis of AI responses.';
    }
    
    // Different settings for different modes
    getTemperatureForMode(mode) {
        const temps = {
            comprehensive: 0.3,
            executive: 0.2,
            consensus: 0.1,
            divergence: 0.4,
            quality: 0.1,
            improvement: 0.3,
            bestof: 0.5
        };
        return temps[mode] || 0.3;
    }
    
    getTokenLimitForMode(mode) {
        // Free tier: 4096 max tokens, Paid tier: 8192 max tokens (handled in synthesis-config.js)
        // Per-mode limits (within tier limits)
        const limits = {
            comprehensive: 2000,  // Can expand up to tier limit
            executive: 1800,      // Increased to reduce over-compressed summaries
            consensus: 1500,      // Can expand up to tier limit
            divergence: 1500,     // Can expand up to tier limit
            quality: 1200,        // Can expand up to tier limit
            improvement: 1800,    // Can expand up to tier limit
            bestof: 3200          // Increased to preserve nuance in Forge summary mode
        };
        return limits[mode] || 1500;
    }
}

const SYNTHESIS_MODE_NAMES = {
    comprehensive: 'Comprehensive Analysis',
    executive: 'Executive Summary',
    consensus: 'Consensus Mapping',
    divergence: 'Divergence Analysis',
    quality: 'Quality Scoring',
    improvement: 'Improvement Guide',
    bestof: 'Best-of-Best Synthesis'
};

function getResultsForExport(scope = 'all') {
    if (scope !== 'selected') {
        return synthesisResults;
    }

    const activeTab = document.querySelector('.result-tab.active');
    if (!activeTab) {
        return null;
    }
    const mode = activeTab.dataset.mode;
    if (!mode || !synthesisResults[mode]) {
        return null;
    }
    return { [mode]: synthesisResults[mode] };
}

function buildMarkdownReport(resultsToExport) {
    let markdown = '# AI Synthesis Report\n\n';
    markdown += `**Generated:** ${new Date().toLocaleString()}\n\n`;
    markdown += '---\n\n';

    Object.entries(resultsToExport).forEach(([mode, result]) => {
        if (result && result.status === 'success') {
            markdown += `## ${SYNTHESIS_MODE_NAMES[mode] || mode}\n\n`;
            markdown += `${result.content || ''}\n\n`;
            markdown += '---\n\n';
        }
    });

    return markdown;
}

function buildDocHtml(resultsToExport) {
    const sections = Object.entries(resultsToExport)
        .filter(([, result]) => result && result.status === 'success')
        .map(([mode, result]) => {
            const title = SYNTHESIS_MODE_NAMES[mode] || mode;
            const rendered = markdownToHtml(result.content || '');
            return `
                <section class="analysis-section">
                    <h2>${escapeHtml(title)}</h2>
                    <div class="analysis-content">${rendered}</div>
                </section>
            `;
        })
        .join('\n');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <title>AI Synthesis Report</title>
    <style>
        body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 36px; line-height: 1.5; }
        h1 { font-size: 24px; margin: 0 0 8px; }
        h2 { font-size: 18px; margin: 0 0 10px; color: #111827; }
        .meta { color: #4b5563; font-size: 12px; margin-bottom: 20px; }
        .analysis-section { margin: 0 0 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
        p { margin: 0 0 10px; }
        ul, ol { margin: 0 0 10px 20px; }
        code { font-family: Menlo, Monaco, Consolas, monospace; background: #f3f4f6; padding: 1px 4px; border-radius: 4px; }
        pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow: auto; }
    </style>
</head>
<body>
    <h1>AI Synthesis Report</h1>
    <div class="meta">Generated: ${escapeHtml(new Date().toLocaleString())}</div>
    ${sections || '<p>No successful analyses available to export.</p>'}
</body>
</html>
    `.trim();
}

function buildExportData(resultsToExport, scope, format) {
    return {
        timestamp: new Date().toISOString(),
        responses: comparisonData?.panes || [],
        analyses: resultsToExport,
        metadata: {
            scope,
            totalModes: Object.keys(resultsToExport).length,
            successfulModes: Object.values(resultsToExport).filter(r => r && r.status === 'success').length,
            exportFormat: format
        }
    };
}

function buildSharePackage(resultsToShare, scope = 'all') {
    const panes = Array.isArray(comparisonData?.panes) ? comparisonData.panes : [];
    const tools = [...new Set(
        panes
            .filter(pane => pane && (pane.hasResponse || pane.response || pane.content))
            .map(pane => String(pane.tool || '').trim())
            .filter(Boolean)
    )];
    const successfulEntries = Object.entries(resultsToShare || {})
        .filter(([, result]) => result && result.status === 'success');
    const analyses = successfulEntries.reduce((acc, [mode, result]) => {
        acc[mode] = {
            title: SYNTHESIS_MODE_NAMES[mode] || mode,
            status: result.status,
            content: result.content || ''
        };
        return acc;
    }, {});

    return {
        version: 1,
        source: 'forge-synthesis',
        timestamp: new Date().toISOString(),
        metadata: {
            scope,
            toolCount: tools.length,
            tools,
            totalModes: Object.keys(resultsToShare || {}).length,
            successfulModes: successfulEntries.length
        },
        analyses
    };
}

function encodeSharePayload(payload) {
    const json = JSON.stringify(payload);
    return btoa(unescape(encodeURIComponent(json)));
}

function createPortableShareLink(sharePackage) {
    // Keep links lightweight and portable by sharing metadata only.
    const linkPayload = {
        version: sharePackage.version,
        source: sharePackage.source,
        timestamp: sharePackage.timestamp,
        metadata: sharePackage.metadata
    };
    const encoded = encodeSharePayload(linkPayload);
    return `${window.location.origin}${window.location.pathname}#forge-share=${encodeURIComponent(encoded)}`;
}

function buildShareClipboardText(sharePackage, shareLink) {
    return [
        'FORGE SYNTHESIS SHARE',
        '',
        `Link: ${shareLink}`,
        '',
        'Payload:',
        JSON.stringify(sharePackage, null, 2)
    ].join('\n');
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
    }
    return false;
}

async function handleExportFormatChange(selectEl) {
    const normalizedFormat = String(selectEl?.value || '').toLowerCase();
    if (!normalizedFormat) {
        return;
    }
    try {
        await exportResults('all', normalizedFormat);
    } finally {
        // Reset selection so users can immediately export the same format again.
        if (selectEl) {
            selectEl.value = '';
        }
    }
}

// Ensure inline HTML handlers can always reach export actions.
if (typeof window !== 'undefined') {
    window.handleExportFormatChange = handleExportFormatChange;
    window.exportResults = exportResults;
    window.shareResults = shareResults;
    window.shareLink = shareLink;
}

// Export functionality - JSON, Markdown, DOC, and PDF
async function exportResults(scope = 'all', format = null) {
    if (!synthesisResults || Object.keys(synthesisResults).length === 0) {
        showToast('❌ No results to export');
        return;
    }

    if (!format) {
        const formatSelect = document.getElementById('exportFormat');
        format = formatSelect ? formatSelect.value : 'json';
    }
    const normalizedFormat = String(format || 'json').toLowerCase();

    const resultsToExport = getResultsForExport(scope);
    if (!resultsToExport || Object.keys(resultsToExport).length === 0) {
        showToast('❌ Please select an analysis to export');
        return;
    }

    const exportData = buildExportData(resultsToExport, scope, normalizedFormat);
    const markdown = buildMarkdownReport(resultsToExport);
    const docHtml = buildDocHtml(resultsToExport);

    if (window.electronAPI && typeof window.electronAPI.exportSynthesis === 'function') {
        const result = await window.electronAPI.exportSynthesis({
            format: normalizedFormat,
            filenameBase: 'forge-synthesis',
            data: exportData,
            jsonContent: JSON.stringify(exportData, null, 2),
            markdownContent: markdown,
            docHtml,
            pdfHtml: docHtml
        });

        if (result?.success) {
            showToast(`✅ ${normalizedFormat.toUpperCase()} exported successfully`);
            return;
        }
        if (result?.cancelled) {
            return;
        }
        showToast(`❌ Export failed${result?.error ? `: ${result.error}` : ''}`);
        return;
    }

    // Browser fallback for non-Electron environments
    switch (normalizedFormat) {
        case 'json':
            exportAsJSON(exportData);
            break;
        case 'markdown':
            exportAsMarkdown(resultsToExport);
            break;
        case 'doc':
            exportAsBlob(docHtml, 'application/msword', `forge-synthesis-${Date.now()}.doc`);
            showToast('📥 DOC export started!');
            break;
        case 'pdf':
            showToast('⚠️ PDF export requires Electron desktop save flow');
            break;
        default:
            exportAsJSON(exportData);
            break;
    }
}

function exportAsBlob(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Export as JSON
function exportAsJSON(exportData) {
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-synthesis-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 JSON export started!');
}

// Export as Markdown
function exportAsMarkdown(resultsToExport) {
    const markdown = buildMarkdownReport(resultsToExport);
    
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-synthesis-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 Markdown export started!');
}

// Save selection as template
function saveAsTemplate() {
    if (selectedModes.length === 0) {
        showToast('❌ Please select at least one analysis framework');
        return;
    }
    
    const templateName = prompt('💾 Enter a name for this template:');
    if (!templateName || !templateName.trim()) {
        return;
    }
    
    const template = {
        name: templateName.trim(),
        modes: [...selectedModes],
        createdAt: new Date().toISOString(),
        usageCount: 0
    };
    
    // Save to localStorage (in a real app, this would be saved to a database)
    let templates = JSON.parse(localStorage.getItem('synthesisTemplates') || '[]');
    templates.push(template);
    localStorage.setItem('synthesisTemplates', JSON.stringify(templates));
    
    showToast(`✅ Template "${templateName}" saved successfully!`);
}

// Share functionality: copies link + payload and uses native share when available.
async function shareResults(scope = 'all') {
    const resultsToShare = getResultsForExport(scope);
    if (!resultsToShare || Object.keys(resultsToShare).length === 0) {
        showToast('❌ No results to share. Please generate analyses first.');
        return;
    }

    const sharePackage = buildSharePackage(resultsToShare, scope);
    if (!Object.keys(sharePackage.analyses || {}).length) {
        showToast('❌ No completed analyses available to share.');
        return;
    }

    const shareLink = createPortableShareLink(sharePackage);
    const shareClipboardText = buildShareClipboardText(sharePackage, shareLink);

    let copied = false;
    try {
        copied = await copyTextToClipboard(shareClipboardText);
    } catch (error) {
        console.warn('Share clipboard copy failed:', error);
    }

    if (navigator.share && typeof navigator.share === 'function') {
        try {
            await navigator.share({
                title: 'Forge Synthesis',
                text: `Forge synthesis ready to review (${sharePackage.metadata.successfulModes} analyses).`,
                url: shareLink
            });
            showToast(copied
                ? '✅ Shared successfully. Link + payload copied to clipboard.'
                : '✅ Shared successfully.');
            return;
        } catch (error) {
            if (error && error.name !== 'AbortError') {
                console.warn('Native share failed:', error);
            }
        }
    }

    if (copied) {
        showToast('🔗 Share package copied to clipboard.');
        return;
    }

    prompt('Copy this share link:', shareLink);
}

// Backward compatibility for any older UI bindings.
function shareLink() {
    return shareResults('all');
}

// Compare two analyses side-by-side
function compareTwoAnalyses() {
    const availableModes = Object.keys(synthesisResults).filter(mode => 
        synthesisResults[mode] && synthesisResults[mode].status === 'success'
    );
    
    if (availableModes.length < 2) {
        showToast('❌ Need at least 2 completed analyses to compare');
        return;
    }
    
    // Show modal to select two analyses
    const mode1 = prompt(`Select first analysis (1-${availableModes.length}):\n${availableModes.map((m, i) => `${i+1}. ${m}`).join('\n')}`);
    const mode2 = prompt(`Select second analysis (1-${availableModes.length}):\n${availableModes.map((m, i) => `${i+1}. ${m}`).join('\n')}`);
    
    if (!mode1 || !mode2) return;
    
    const index1 = parseInt(mode1) - 1;
    const index2 = parseInt(mode2) - 1;
    
    if (isNaN(index1) || isNaN(index2) || index1 < 0 || index2 < 0 || 
        index1 >= availableModes.length || index2 >= availableModes.length || index1 === index2) {
        showToast('❌ Invalid selection');
        return;
    }
    
    // Open comparison view (in a real app, this would open a side-by-side modal)
    showToast(`⚖️ Opening comparison view for "${availableModes[index1]}" vs "${availableModes[index2]}"...`);
    // TODO: Implement actual side-by-side comparison view
    console.log('Compare:', availableModes[index1], 'vs', availableModes[index2]);
}

// Ask follow-up question
function askFollowUp() {
    const question = prompt('💬 Enter your follow-up question:');
    if (!question || !question.trim()) {
        return;
    }
    
    showToast('💬 Follow-up question sent! Redirecting to workspace...');
    // In a real app, this would navigate back to workspace with the question pre-filled
    // For now, we'll just log it
    console.log('Follow-up question:', question.trim());
    
    // Navigate back to workspace
    setTimeout(() => {
        if (window.electronAPI && window.electronAPI.returnToToolshelf) {
            window.electronAPI.returnToToolshelf();
        } else {
            goBack();
        }
    }, 1000);
}

// Copy all results to clipboard
async function copyResults() {
    if (!synthesisResults || Object.keys(synthesisResults).length === 0) {
        showToast('❌ No results to copy');
        return;
    }
    
    let allText = `AI SYNTHESIS REPORT\nGenerated: ${new Date().toLocaleString()}\n\n`;
    
    Object.entries(synthesisResults).forEach(([mode, result]) => {
        if (result.status === 'success') {
            allText += `\n=== ${mode.toUpperCase()} ===\n`;
            allText += result.content + '\n';
        }
    });
    
    try {
        await navigator.clipboard.writeText(allText);
        showToast('📋 All analyses copied to clipboard!');
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('❌ Failed to copy. Please try again.');
    }
}

// Go back to comparison view
function goBack() {
    if (window.electronAPI && window.electronAPI.closeWindow) {
        window.electronAPI.closeWindow();
    } else {
        window.close();
    }
}

async function goToToolshelf() {
    try {
        // Step 1: Close the comparison window if it's open
        if (window.electronAPI && window.electronAPI.closeComparisonWindowForNavigation) {
            await window.electronAPI.closeComparisonWindowForNavigation();
        }
        
        // Step 2: Call returnToToolshelf to show toolshelf in main window
        // This will load the toolshelf in the main window, focus it, and clean up BrowserViews
        if (window.electronAPI && window.electronAPI.returnToToolshelf) {
            await window.electronAPI.returnToToolshelf();
        }
        
        // Step 3: Wait a bit to ensure main window is focused and visible
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Step 4: Close this synthesis window
        // Use window.close() directly to avoid any IPC issues
        window.close();
    } catch (error) {
        console.error('Error returning to toolshelf:', error);
        // Fallback: just close the window
        window.close();
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Convert markdown to HTML (for beautiful formatting of all 7 analyses)
function markdownToHtml(markdown) {
    if (!markdown) return '';
    if (markdown.length > 50000) markdown = markdown.substring(0, 50000) + '\n\n*[Response truncated for performance]*';
    
    let html = markdown;
    
    // Escape HTML first to prevent XSS, but preserve markdown patterns
    // We'll convert markdown, then apply escaping to non-markdown parts
    
    // Convert headers (### H3, ## H2, # H1)
    html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
    
    // Convert bold (**text** or __text__)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    
    // Convert italic (*text* or _text_)
    html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/(?<!_)_([^_]+?)_(?!_)/g, '<em>$1</em>');
    
    // Convert unordered lists (- item or * item) - process before numbered lists
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    
    // Convert numbered lists (1. item) - after unordered to avoid conflicts
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    
    // Wrap consecutive <li> elements in <ul>
    // Process in a way that preserves order but wraps everything properly
    html = html.replace(/(<li>.*?<\/li>(?:\s*<li>.*?<\/li>)*)/g, (match) => {
        // Skip if already wrapped
        if (match.includes('<ul>') || match.includes('<ol>')) {
            return match;
        }
        // Clean up whitespace and wrap
        const cleaned = match.replace(/\n\s*/g, '');
        return '<ul>' + cleaned + '</ul>';
    });
    
    // Convert code blocks (```code```)
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Convert inline code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Convert links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Convert line breaks (double newline = paragraph, single = <br>)
    // First, split by double newlines to create paragraphs
    const paragraphs = html.split(/\n\s*\n/);
    html = paragraphs.map(p => {
        p = p.trim();
        if (!p) return '';
        // If it's already a header, list, or pre, don't wrap in <p>
        if (p.match(/^<(h[1-6]|ul|ol|pre|div|p)/)) {
            return p;
        }
        // Replace single newlines with <br> within paragraphs
        p = p.replace(/\n/g, '<br>');
        return '<p>' + p + '</p>';
    }).filter(p => p).join('\n');
    
    // Escape any remaining HTML that wasn't converted from markdown
    // But preserve our generated HTML tags
    // This is tricky - we've already converted markdown, so now we just need to
    // escape any remaining raw HTML (which shouldn't exist if content is clean)
    
    return html;
}

function showToast(message) {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) {
        existing.remove();
    }
    
    // Create new toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}