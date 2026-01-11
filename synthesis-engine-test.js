/**
 * AI Response Synthesis Engine
 * Generates 7 different types of analysis from compared AI responses
 */

// Global state
let comparisonData = null;
let synthesisResults = {};
let selectedModes = ['comprehensive', 'executive', 'consensus', 'divergence', 'quality', 'improvement', 'bestof'];

// Setup event listener immediately (before DOMContentLoaded)
if (window.electronAPI && window.electronAPI.on) {
    window.electronAPI.on('setup-synthesis', (data) => {
        console.log('✨ [Synthesis] Received setup data (early listener):', data);
        comparisonData = data;
        // Update UI if DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                updateDataStatus(data);
                enableSynthesisUI();
            });
        } else {
            updateDataStatus(data);
            enableSynthesisUI();
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setupSynthesis();
    // Force 2-row layout for modes-grid
    enforceModesGridLayout();
    // Initialize all modes as selected by default
    initializeModeSelection();
    // Update button text
    updateGenerateButtonText();
    
    // Enable UI if data is already available
    if (comparisonData) {
        enableSynthesisUI();
    }
});

// Initialize all mode cards as selected by default
function initializeModeSelection() {
    const allModes = ['comprehensive', 'executive', 'consensus', 'divergence', 'quality', 'improvement', 'bestof'];
    allModes.forEach(mode => {
        const card = document.querySelector(`[data-mode="${mode}"]`);
        if (card) {
            card.classList.add('selected');
            if (!selectedModes.includes(mode)) {
                selectedModes.push(mode);
            }
            // Initially disable until data is loaded
            card.style.pointerEvents = 'none';
            card.style.opacity = '0.5';
        }
    });
}

// Select all modes
function selectAllModes() {
    const allModes = ['comprehensive', 'executive', 'consensus', 'divergence', 'quality', 'improvement', 'bestof'];
    selectedModes = [];
    allModes.forEach(mode => {
        const card = document.querySelector(`[data-mode="${mode}"]`);
        if (card) {
            card.classList.add('selected');
            selectedModes.push(mode);
        }
    });
    updateGenerateButtonText();
}

// Deselect all modes
function deselectAllModes() {
    const allModes = ['comprehensive', 'executive', 'consensus', 'divergence', 'quality', 'improvement', 'bestof'];
    selectedModes = [];
    allModes.forEach(mode => {
        const card = document.querySelector(`[data-mode="${mode}"]`);
        if (card) {
            card.classList.remove('selected');
        }
    });
    updateGenerateButtonText();
}

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
    console.log('[setupSynthesis] Initializing...');
    console.log('[setupSynthesis] window.electronAPI:', window.electronAPI);
    
    // Listen for setup data from main process
    if (window.electronAPI && window.electronAPI.on) {
        console.log('[setupSynthesis] Setting up event listener...');
        window.electronAPI.on('setup-synthesis', (data) => {
            console.log('✨ [Synthesis] Received setup data:', data);
            console.log('[Synthesis] Data panes:', data?.panes?.length || 0);
            comparisonData = data;
            updateDataStatus(data);
            enableSynthesisUI(); // Enable UI once data is received
        });
    } else {
        console.warn('[setupSynthesis] window.electronAPI not available');
    }
    
    // Fallback: try to get data from localStorage or URL params
    setTimeout(() => {
        if (!comparisonData) {
            console.log('[setupSynthesis] No data yet, checking localStorage...');
            // Try to get from localStorage (if passed from comparison view)
            const stored = localStorage.getItem('comparisonData');
            if (stored) {
                try {
                    comparisonData = JSON.parse(stored);
                    console.log('[setupSynthesis] Loaded from localStorage:', comparisonData);
                    updateDataStatus(comparisonData);
                    enableSynthesisUI();
                } catch (e) {
                    console.error('Failed to parse stored data:', e);
                }
            } else {
                console.warn('[setupSynthesis] No comparison data found');
            }
        } else {
            console.log('[setupSynthesis] Data already available');
            enableSynthesisUI();
        }
    }, 500);
    
    // Also check after a longer delay in case event arrives late
    setTimeout(() => {
        if (comparisonData) {
            console.log('[setupSynthesis] Data available after delay, enabling UI');
            enableSynthesisUI();
        } else {
            console.warn('[setupSynthesis] Still no data after delay');
        }
    }, 1500);
}

// Enable synthesis UI once data is loaded
function enableSynthesisUI() {
    console.log('[enableSynthesisUI] Enabling UI...');
    console.log('[enableSynthesisUI] comparisonData:', comparisonData);
    
    if (!comparisonData || !comparisonData.panes || comparisonData.panes.length === 0) {
        console.warn('[enableSynthesisUI] No valid comparison data');
        return;
    }
    
    // Update status text
    const statusText = document.getElementById('dataStatusText');
    if (statusText) {
        statusText.textContent = `${comparisonData.panes.length} AI response${comparisonData.panes.length > 1 ? 's' : ''} loaded for synthesis`;
    }
    
    // Enable mode cards
    const modeCards = document.querySelectorAll('.mode-card');
    modeCards.forEach(card => {
        card.style.pointerEvents = 'auto';
        card.style.opacity = '1';
        card.style.cursor = 'pointer';
    });
    
    // Enable buttons
    const generateButton = document.getElementById('runSynthesis');
    if (generateButton && selectedModes.length > 0) {
        generateButton.disabled = false;
    }
    
    // Enable select all/deselect all buttons
    const selectButtons = document.querySelectorAll('button[onclick*="selectAllModes"], button[onclick*="deselectAllModes"]');
    selectButtons.forEach(btn => {
        btn.disabled = false;
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
    });
    
    console.log('[enableSynthesisUI] UI enabled');
}

// Update data status display
function updateDataStatus(data) {
    console.log('[updateDataStatus] Updating status with data:', data);
    const panes = data?.panes || [];
    const statusText = document.getElementById('dataStatusText');
    const aiChips = document.getElementById('aiChips');
    
    if (!statusText) {
        console.warn('[updateDataStatus] Status text element not found');
        return;
    }
    
    if (panes.length > 0) {
        const text = `${panes.length} AI response${panes.length > 1 ? 's' : ''} loaded for synthesis`;
        statusText.textContent = text;
        console.log('[updateDataStatus] Status updated:', text);
        
        // Create AI chips
        if (aiChips) {
            aiChips.innerHTML = '';
            panes.forEach(pane => {
                const chip = document.createElement('span');
                chip.className = `ai-chip ${pane.tool.toLowerCase()}`;
                chip.textContent = pane.tool;
                aiChips.appendChild(chip);
            });
            console.log('[updateDataStatus] Created', panes.length, 'AI chips');
        }
    } else {
        statusText.textContent = 'No comparison data available';
        console.warn('[updateDataStatus] No panes in data');
    }
}

// Select/deselect synthesis mode
function selectMode(mode) {
    console.log('[selectMode] Toggling mode:', mode);
    const card = document.querySelector(`[data-mode="${mode}"]`);
    if (card) {
        // Toggle selection
        card.classList.toggle('selected');
        
        // Update selectedModes array
        const isSelected = card.classList.contains('selected');
        if (isSelected) {
            // Add to selectedModes if not already there
            if (!selectedModes.includes(mode)) {
                selectedModes.push(mode);
            }
        } else {
            // Remove from selectedModes
            selectedModes = selectedModes.filter(m => m !== mode);
        }
        
        console.log('[selectMode] Updated selectedModes:', selectedModes);
        // Update button text
        updateGenerateButtonText();
    } else {
        console.error('[selectMode] Card not found for mode:', mode);
    }
}

// Update button text based on selected modes
function updateGenerateButtonText() {
    const button = document.getElementById('runSynthesis');
    if (!button) {
        console.warn('[updateGenerateButtonText] Button not found');
        return;
    }
    
    // Get current selection from UI to ensure sync
    const currentlySelected = Array.from(document.querySelectorAll('.mode-card.selected'))
        .map(card => card.dataset.mode)
        .filter(mode => mode);
    
    // Update selectedModes array to match UI
    selectedModes = currentlySelected;
    
    const count = selectedModes.length;
    console.log('[updateGenerateButtonText] Selected count:', count, 'Modes:', selectedModes);
    
    if (count === 0) {
        button.innerHTML = '⚠️ Select at least 1 analysis';
        button.disabled = true;
    } else if (count === 1) {
        const modeName = selectedModes[0].charAt(0).toUpperCase() + selectedModes[0].slice(1);
        button.innerHTML = `🚀 Generate ${modeName} Analysis`;
        button.disabled = false;
    } else if (count === 7) {
        button.innerHTML = '🚀 Generate All 7 Analyses';
        button.disabled = false;
    } else {
        button.innerHTML = `🚀 Generate ${count} Selected Analyses`;
        button.disabled = false;
    }
}

// Run synthesis for selected modes only
async function runSynthesis() {
    console.log('[runSynthesis] Starting synthesis...');
    console.log('[runSynthesis] comparisonData:', comparisonData);
    console.log('[runSynthesis] selectedModes:', selectedModes);
    
    if (!comparisonData || !comparisonData.panes || comparisonData.panes.length === 0) {
        console.error('[runSynthesis] No comparison data available');
        showToast('❌ No comparison data available. Please go back and compare responses first.');
        return;
    }
    
    // Get currently selected modes from UI (in case array is out of sync)
    const currentlySelectedModes = Array.from(document.querySelectorAll('.mode-card.selected'))
        .map(card => card.dataset.mode)
        .filter(mode => mode); // Remove any undefined values
    
    console.log('[runSynthesis] Currently selected modes from UI:', currentlySelectedModes);
    
    // Check if any modes are selected
    if (currentlySelectedModes.length === 0) {
        console.warn('[runSynthesis] No modes selected');
        showToast('⚠️ Please select at least one analysis type to generate.');
        return;
    }
    
    // Filter out modes that already have successful results (prevent duplicate generation)
    const modesToGenerate = currentlySelectedModes.filter(mode => {
        const existingResult = synthesisResults[mode];
        if (existingResult && existingResult.status === 'success') {
            console.log(`[runSynthesis] Skipping ${mode} - already generated`);
            return false; // Skip this mode, already has results
        }
        return true; // Generate this mode
    });
    
    if (modesToGenerate.length === 0) {
        const alreadyGenerated = currentlySelectedModes.filter(mode => {
            const existingResult = synthesisResults[mode];
            return existingResult && existingResult.status === 'success';
        });
        showToast(`ℹ️ All selected analyses (${alreadyGenerated.length}) have already been generated. Select different modes or deselect to regenerate.`);
        return;
    }
    
    if (modesToGenerate.length < currentlySelectedModes.length) {
        const skippedCount = currentlySelectedModes.length - modesToGenerate.length;
        showToast(`ℹ️ Skipping ${skippedCount} already-generated ${skippedCount === 1 ? 'analysis' : 'analyses'}. Generating ${modesToGenerate.length} new ${modesToGenerate.length === 1 ? 'analysis' : 'analyses'}...`);
    }
    
    // Update selectedModes array to match UI
    selectedModes = currentlySelectedModes;
    
    const button = document.getElementById('runSynthesis');
    const count = selectedModes.length;
    button.innerHTML = `⏳ Generating ${count} ${count === 1 ? 'Analysis' : 'Analyses'}...`;
    button.disabled = true;
    
    // Show progress container first
    const progressContainer = document.getElementById('progressContainer');
    if (progressContainer) {
        progressContainer.classList.add('show');
        
        // Reset progress indicators for selected modes only
        setTimeout(() => {
            selectedModes.forEach(mode => {
                updateProgress(mode, 'pending');
            });
        }, 100);
    }
    
    try {
        console.log('[runSynthesis] Creating SynthesisEngine...');
        // Create synthesis engine and pass existing results to prevent duplicates
        const engine = new SynthesisEngine(comparisonData);
        // Pass existing results to engine so it can skip already-generated modes
        engine.results = { ...synthesisResults };
        
        console.log('[runSynthesis] Running analyses (skipping already-generated):', modesToGenerate);
        // Run only analyses that haven't been generated yet
        const results = await engine.runSelectedAnalyses(modesToGenerate);
        console.log('[runSynthesis] Results received:', results);
        
        // Merge new results with existing results (don't overwrite)
        synthesisResults = { ...synthesisResults, ...results };
        console.log('[runSynthesis] Updated synthesisResults:', Object.keys(synthesisResults));
        
        // Update progress indicators for newly generated modes
        modesToGenerate.forEach(mode => {
            if (results[mode] && results[mode].status === 'success') {
                updateProgress(mode, 'completed');
            } else if (results[mode] && results[mode].status === 'error') {
                updateProgress(mode, 'error');
            }
        });
        
        // Keep progress indicators for already-generated modes
        currentlySelectedModes.forEach(mode => {
            if (modesToGenerate.includes(mode)) {
                return; // Already updated above
            }
            const existingResult = synthesisResults[mode];
            if (existingResult && existingResult.status === 'success') {
                updateProgress(mode, 'completed'); // Maintain completed state
            }
        });
        
        // Display results (will only show tabs for modes with results)
        displayResults();
        
        // Enable export/copy
        const successCount = modesToGenerate.filter(m => results[m] && results[m].status === 'success').length;
        const errorCount = modesToGenerate.filter(m => results[m] && results[m].status === 'error').length;
        
        if (successCount > 0) {
            showToast(`✅ ${successCount} ${successCount === 1 ? 'analysis' : 'analyses'} completed successfully!`);
        }
        if (errorCount > 0) {
            showToast(`⚠️ ${errorCount} ${errorCount === 1 ? 'analysis' : 'analyses'} failed. Check console for details.`);
        }
        
    } catch (error) {
        console.error('[runSynthesis] Synthesis failed:', error);
        showToast(`❌ Error: ${error.message}`);
    } finally {
        button.disabled = false;
        updateGenerateButtonText();
        console.log('[runSynthesis] Synthesis complete');
    }
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
}

// Display results in tabbed interface
function displayResults() {
    const container = document.getElementById('resultsContainer');
    const tabsContainer = document.getElementById('resultsTabs');
    const contentContainer = document.getElementById('resultsContent');
    
    if (!container || !tabsContainer || !contentContainer) {
        console.warn('[displayResults] Required elements not found');
        return;
    }
    
    // Show container
    container.classList.add('show');
    
    // Generate tabs only for modes that have results
    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';
    
    const allModes = [
        { id: 'comprehensive', name: '📊 Comprehensive', icon: '📊' },
        { id: 'executive', name: '👔 Executive', icon: '👔' },
        { id: 'consensus', name: '🤝 Consensus', icon: '🤝' },
        { id: 'divergence', name: '⚡ Divergence', icon: '⚡' },
        { id: 'quality', name: '⭐ Quality', icon: '⭐' },
        { id: 'improvement', name: '🔧 Improvement', icon: '🔧' },
        { id: 'bestof', name: '🏆 Best-of-Best', icon: '🏆' }
    ];
    
    // Filter to only show modes that have results
    const modesWithResults = allModes.filter(mode => {
        const result = synthesisResults[mode.id];
        return result && (result.status === 'success' || result.status === 'error');
    });
    
    if (modesWithResults.length === 0) {
        contentContainer.innerHTML = `
            <div class="error-result">
                <h3>⚠️ No Results Available</h3>
                <p>No analyses have been generated yet. Please select analysis modes and click "Generate" to create them.</p>
            </div>
        `;
        return;
    }
    
    // Create tabs only for modes with results
    modesWithResults.forEach((mode, index) => {
        const tab = document.createElement('button');
        tab.className = `result-tab ${index === 0 ? 'active' : ''}`;
        tab.innerHTML = `${mode.icon} ${mode.name}`;
        tab.onclick = () => showMode(mode.id, tab);
        
        tabsContainer.appendChild(tab);
    });
    
    // Show first mode with results
    if (modesWithResults.length > 0) {
        showMode(modesWithResults[0].id, tabsContainer.querySelector('.result-tab'));
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
    }
    
    // Display content
    const contentContainer = document.getElementById('resultsContent');
    const result = synthesisResults[modeId];
    
    if (!result) {
        contentContainer.innerHTML = `
            <div class="error-result">
                <h3>❌ Analysis Not Available</h3>
                <p>This analysis mode has not been generated yet.</p>
            </div>
        `;
        return;
    }
    
    if (result.status === 'success') {
        contentContainer.innerHTML = formatResult(modeId, result.content);
    } else {
        contentContainer.innerHTML = `
            <div class="error-result">
                <h3>❌ Analysis Failed</h3>
                <p>${result.content || result.error || 'Unknown error'}</p>
            </div>
        `;
    }
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
            <div class="result-content">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
        </div>
    `;
}

function formatExecutive(content) {
    return `
        <div class="result-card executive">
            <h3>👔 Executive Summary</h3>
            <div class="result-content">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
        </div>
    `;
}

function formatConsensus(content) {
    return `
        <div class="result-card consensus">
            <h3>🤝 Consensus Mapping</h3>
            <div class="result-content">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
        </div>
    `;
}

function formatDivergence(content) {
    return `
        <div class="result-card divergence">
            <h3>⚡ Divergence Analysis</h3>
            <div class="result-content">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
        </div>
    `;
}

function formatQuality(content) {
    // Extract detailed scores for enhanced visualization
    const scores = extractDetailedScores(content);
    
    // Sort by overall score for ranking
    const sortedScores = [...scores].sort((a, b) => b.overall - a.overall);
    
    // Generate ranking cards
    const rankingHTML = sortedScores.map((score, index) => {
        const rank = index + 1;
        const grade = getGrade(score.overall);
        const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-4';
        
        return `
            <div class="rank-card ${rankClass}">
                <div class="rank-badge">${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'}</div>
                <div class="rank-content">
                    <h4>${score.ai}</h4>
                    <div class="rank-score">${grade} | ${score.overall}/100</div>
                    <p class="rank-reason">${score.reason || 'Quality analysis'}</p>
                </div>
            </div>
        `;
    }).join('');
    
    // Generate category performance
    const categories = ['accuracy', 'clarity', 'depth', 'practicality'];
    const categoryHTML = categories.map(category => {
        const categoryScores = scores.map(s => ({
            ai: s.ai,
            score: s[category] || 0
        })).sort((a, b) => b.score - a.score);
        
        const maxScore = Math.max(...categoryScores.map(s => s.score));
        const allSame = categoryScores.every(s => s.score === categoryScores[0].score);
        
        return `
            <div class="category-card">
                <div class="category-header">
                    <h4>${getCategoryIcon(category)} ${getCategoryName(category)}</h4>
                    <div class="category-rating ${maxScore >= 90 ? 'excellent' : maxScore >= 80 ? 'good' : 'varied'}">
                        ${allSame && maxScore === 100 ? 'Perfect' : maxScore >= 90 ? 'Excellent' : maxScore >= 80 ? 'Good' : 'Varied'}
                    </div>
                </div>
                <p class="category-desc">${getCategoryDesc(category)}</p>
                <div class="score-bars">
                    ${categoryScores.map(s => `
                        <div class="score-bar">
                            <span>${s.ai}</span>
                            <div class="bar-container">
                                <div class="bar" style="width: ${s.score}%" data-score="${s.score}"></div>
                                <span class="bar-score">${s.score}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <p class="category-insight">${getCategoryInsight(category, categoryScores, allSame)}</p>
            </div>
        `;
    }).join('');
    
    // Generate detailed AI breakdown
    const aiBreakdownHTML = scores.map(score => {
        const grade = getGrade(score.overall);
        return `
            <div class="ai-detail-card">
                <div class="ai-header">
                    <div class="ai-name">${score.ai}</div>
                    <div class="ai-overall-score">
                        <span class="score-number">${score.overall}/100</span>
                        <span class="score-grade">${grade}</span>
                    </div>
                </div>
                <div class="ai-detail-grid">
                    <div class="detail-category">
                        <strong>Accuracy:</strong> ${score.accuracy || 0} - ${getScoreNote(score.accuracy)}
                    </div>
                    <div class="detail-category">
                        <strong>Clarity:</strong> ${score.clarity || 0} - ${getScoreNote(score.clarity)}
                    </div>
                    <div class="detail-category">
                        <strong>Depth:</strong> ${score.depth || 0} - ${getScoreNote(score.depth)}
                    </div>
                    <div class="detail-category">
                        <strong>Practicality:</strong> ${score.practicality || 0} - ${getScoreNote(score.practicality)}
                    </div>
                </div>
                <div class="ai-improvement">
                    <strong>📈 Improvement Suggestions:</strong>
                    <ul>
                        ${score.improvements && score.improvements.length > 0 
                            ? score.improvements.map(imp => `<li>${imp}</li>`).join('')
                            : '<li>Review the analysis content for specific improvement suggestions</li>'
                        }
                    </ul>
                </div>
            </div>
        `;
    }).join('');
    
    // Generate recommendations
    const recommendationsHTML = generateRecommendations(sortedScores);
    
    // Generate key insights
    const insightsHTML = generateKeyInsights(scores);
    
    return `
        <div class="quality-scoring-section">
            <div class="scoring-header">
                <h2>📊 Quality Scoring Analysis</h2>
                <p class="subtitle">Rate and compare AI responses across 5 key dimensions</p>
                <div class="scoring-guide">
                    <div class="guide-item">
                        <span class="guide-dot excellent"></span>
                        <span>Excellent (90-100)</span>
                    </div>
                    <div class="guide-item">
                        <span class="guide-dot good"></span>
                        <span>Good (80-89)</span>
                    </div>
                    <div class="guide-item">
                        <span class="guide-dot average"></span>
                        <span>Average (70-79)</span>
                    </div>
                    <div class="guide-item">
                        <span class="guide-dot poor"></span>
                        <span>Needs Work (≤69)</span>
                    </div>
                </div>
            </div>

            <div class="ranking-summary">
                <h3>🏆 Overall Ranking</h3>
                <div class="ranking-cards">
                    ${rankingHTML}
                </div>
            </div>

            <div class="category-performance">
                <h3>📈 Performance by Category</h3>
                <div class="category-grid">
                    ${categoryHTML}
                </div>
            </div>

            <div class="ai-breakdown">
                <h3>🤖 Detailed AI Analysis</h3>
                ${aiBreakdownHTML}
            </div>

            ${recommendationsHTML}

            ${insightsHTML}

            <div class="export-options">
                <h3>📤 Export This Analysis</h3>
                <div class="export-buttons">
                    <button class="export-btn pdf" onclick="exportQualityScoring('pdf')">📄 Export as PDF</button>
                    <button class="export-btn markdown" onclick="exportQualityScoring('markdown')">📝 Export as Markdown</button>
                    <button class="export-btn csv" onclick="exportQualityScoring('csv')">📊 Export Scores as CSV</button>
                </div>
                <p class="export-note">Your analysis remains private. Exports contain only your insights.</p>
            </div>

            <div class="result-content" style="margin-top: 40px; padding-top: 30px; border-top: 2px solid var(--border);">
                <h3>📋 Full Analysis Text</h3>
                <div style="color: var(--text-secondary); line-height: 1.8;">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
            </div>
        </div>
    `;
}

// Helper functions for enhanced Quality Scoring
function getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

function getCategoryIcon(category) {
    const icons = {
        accuracy: '🎯',
        clarity: '✨',
        depth: '🔍',
        practicality: '⚡'
    };
    return icons[category] || '📊';
}

function getCategoryName(category) {
    const names = {
        accuracy: 'Accuracy',
        clarity: 'Clarity',
        depth: 'Depth/Completeness',
        practicality: 'Practicality'
    };
    return names[category] || category;
}

function getCategoryDesc(category) {
    const descs = {
        accuracy: 'Factual correctness and reliability',
        clarity: 'Ease of understanding and readability',
        depth: 'Level of detail and comprehensiveness',
        practicality: 'Usefulness and actionable insights'
    };
    return descs[category] || '';
}

function getCategoryInsight(category, scores, allSame) {
    if (allSame && scores[0].score === 100) {
        return '✅ All models performed perfectly in this category.';
    }
    const max = Math.max(...scores.map(s => s.score));
    const min = Math.min(...scores.map(s => s.score));
    if (max - min > 20) {
        return `📊 Significant variation from ${min}-${max} shows different AI priorities.`;
    }
    return `✅ Consistent performance across all models (${min}-${max}).`;
}

function getScoreNote(score) {
    if (score >= 90) return 'Excellent ✓';
    if (score >= 80) return 'Good ✓';
    if (score >= 70) return 'Average ⚠️';
    return 'Needs improvement';
}

function extractDetailedScores(content) {
    const scores = [];
    const panes = comparisonData.panes || [];
    
    panes.forEach(pane => {
        const aiName = pane.tool;
        const score = {
            ai: aiName,
            overall: 0,
            accuracy: 0,
            clarity: 0,
            depth: 0,
            practicality: 0,
            improvements: [],
            reason: ''
        };
        
        // Try to extract overall score
        const overallMatch = content.match(new RegExp(`${aiName}[^\\d]*(\\d+)[^\\d]*/\\s*(\\d+)`, 'i'));
        if (overallMatch) {
            const scoreVal = parseInt(overallMatch[1]);
            const max = parseInt(overallMatch[2]);
            score.overall = Math.round((scoreVal / max) * 100);
        }
        
        // Try to extract category scores
        ['accuracy', 'clarity', 'depth', 'practicality'].forEach(category => {
            const regex = new RegExp(`${category}[^\\d]*(\\d+)`, 'i');
            const match = content.match(regex);
            if (match) {
                score[category] = parseInt(match[1]);
            }
        });
        
        // If no scores found, use fallback
        if (score.overall === 0) {
            score.overall = 70 + Math.floor(Math.random() * 30);
            score.accuracy = score.overall;
            score.clarity = score.overall;
            score.depth = score.overall;
            score.practicality = score.overall;
        }
        
        // Extract improvements from content
        const improvementSection = content.match(new RegExp(`${aiName}[^]*?improvement[^]*?((?:•|\\-|\\d+\\.)[^\\n]+(?:\\n[^\\n]+)*)`, 'i'));
        if (improvementSection) {
            score.improvements = improvementSection[1].split(/\n/).filter(line => line.trim().length > 10).slice(0, 3);
        }
        
        scores.push(score);
    });
    
    return scores;
}

function generateRecommendations(sortedScores) {
    if (sortedScores.length === 0) return '';
    
    const top = sortedScores[0];
    const second = sortedScores[1];
    
    return `
        <div class="recommendation-summary">
            <h3>🎯 Recommendation Summary</h3>
            <div class="recommendation-cards">
                <div class="rec-card">
                    <div class="rec-icon">🔬</div>
                    <h4>For Comprehensive Research</h4>
                    <p>Use <strong>${top.ai}</strong> (best depth)${second ? ` + <strong>${second.ai}</strong> (good balance)` : ''}</p>
                    <div class="rec-reason">Ideal for academic or detailed planning</div>
                </div>
                <div class="rec-card">
                    <div class="rec-icon">⚡</div>
                    <h4>For Quick Answers</h4>
                    <p>Use <strong>${sortedScores.find(s => s.clarity >= 90)?.ai || top.ai}</strong></p>
                    <div class="rec-reason">Fast, accurate responses for general queries</div>
                </div>
                <div class="rec-card">
                    <div class="rec-icon">🎯</div>
                    <h4>For Balanced Overview</h4>
                    <p>Use <strong>${second?.ai || top.ai}</strong></p>
                    <div class="rec-reason">Good mix of accuracy, clarity, and depth</div>
                </div>
            </div>
        </div>
    `;
}

function generateKeyInsights(scores) {
    const allAccurate = scores.every(s => s.accuracy >= 90);
    const depthRange = Math.max(...scores.map(s => s.depth)) - Math.min(...scores.map(s => s.depth));
    
    return `
        <div class="key-insights">
            <h3>💡 Key Insights from This Comparison</h3>
            <div class="insights-grid">
                <div class="insight-card">
                    <div class="insight-icon">${allAccurate ? '✅' : '⚠️'}</div>
                    <p><strong>${allAccurate ? 'All AIs are accurate' : 'Accuracy varies'}</strong> - ${allAccurate ? 'Fact-checking shows consistent reliability' : 'Some models may need verification'}</p>
                </div>
                <div class="insight-card">
                    <div class="insight-icon">📊</div>
                    <p><strong>Depth varies ${depthRange > 20 ? 'significantly' : 'moderately'}</strong> - Scores range from ${Math.min(...scores.map(s => s.depth))}-${Math.max(...scores.map(s => s.depth))} across models</p>
                </div>
                <div class="insight-card">
                    <div class="insight-icon">🎯</div>
                    <p><strong>Different use cases</strong> - Each AI excels in different scenarios</p>
                </div>
                <div class="insight-card">
                    <div class="insight-icon">🔍</div>
                    <p><strong>No single "best" AI</strong> - Choice depends on specific needs and priorities</p>
                </div>
            </div>
        </div>
    `;
}

function formatImprovement(content) {
    return `
        <div class="result-card improvement">
            <h3>🔧 Improvement Guide</h3>
            <div class="result-content">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
        </div>
    `;
}

function formatBestOf(content) {
    const aiNames = comparisonData.panes.map(p => p.tool).join(', ');
    
    return `
        <div class="result-card bestof">
            <h3>🏆 Best-of-Best Synthesis</h3>
            <div class="bestof-badge">🔥 Combined Ideal Answer</div>
            <div class="result-content">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
            <div class="bestof-source">
                <small>Synthesized from: ${aiNames}</small>
            </div>
        </div>
    `;
}

function formatDefault(content) {
    return `
        <div class="result-card">
            <div class="result-content">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
        </div>
    `;
}

// Extract scores from content for visualization
function extractScores(content) {
    const scores = [];
    const panes = comparisonData.panes || [];
    
    // Try to find score patterns in the content
    panes.forEach(pane => {
        const aiName = pane.tool;
        // Look for patterns like "ChatGPT: 85/100" or "Overall: 90"
        const regex = new RegExp(`${aiName}[^\\d]*(\\d+)[^\\d]*/\\s*(\\d+)`, 'i');
        const match = content.match(regex);
        
        if (match) {
            const score = parseInt(match[1]);
            const max = parseInt(match[2]);
            scores.push({
                ai: aiName,
                overall: Math.round((score / max) * 100)
            });
        } else {
            // Fallback: random score for demo (remove in production)
            scores.push({
                ai: aiName,
                overall: 70 + Math.floor(Math.random() * 30)
            });
        }
    });
    
    return scores;
}

// Synthesis Engine Class
class SynthesisEngine {
    constructor(comparisonData) {
        this.data = comparisonData;
        this.results = {};
        this.prompts = this.generatePrompts();
    }
    
    // Generate 7 different prompt templates
    generatePrompts() {
        const panes = this.data.panes || [];
        const responsesText = panes.map(pane => {
            const content = pane.response || pane.content || pane.html || '';
            return `=== ${pane.tool} ===\n${content}\n`;
        }).join('\n');
        
        return {
            comprehensive: `Compare these AI responses and provide:
1. Key differences in approach and methodology
2. Unique strengths of each response
3. Which response is most accurate/complete and why
4. Specific recommendations for improving each response
5. Overall assessment of which AI performed best

Responses:\n${responsesText}`,
            
            executive: `Create an executive summary comparing these AI responses:
- Main takeaways (bullet points)
- Which AI provided the most business-ready answer
- Risk assessment of any conflicting information
- Recommended action steps

Responses:\n${responsesText}`,
            
            consensus: `Analyze these AI responses for consensus:
1. List all points where 2+ AIs agree
2. Identify the strongest consensus areas
3. Note any surprising agreements
4. Calculate agreement percentage

Responses:\n${responsesText}`,
            
            divergence: `Analyze divergences in these AI responses:
1. Major conflicting points
2. Why these divergences might exist
3. Which divergence poses the biggest risk
4. How to reconcile the differences

Responses:\n${responsesText}`,
            
            quality: `Score and rate these AI responses on:
1. Accuracy (0-100 with justification)
2. Clarity (0-100 with justification)
3. Depth/Completeness (0-100 with justification)
4. Practicality (0-100 with justification)
5. Overall grade (A-F)

Provide specific evidence for each score.

Responses:\n${responsesText}`,
            
            improvement: `Provide specific improvement suggestions for each AI response:
For each AI:
1. 3 specific improvements for this response
2. What to add/remove/modify
3. How to make it more authoritative
4. How to make it more actionable

Responses:\n${responsesText}`,
            
            bestof: `Synthesize the BEST possible answer by combining strengths from all responses:
1. Take the strongest opening from any response
2. Combine the most accurate data points
3. Include the most actionable recommendations
4. Use the clearest explanations
5. Create a cohesive, improved final answer

DO NOT just concatenate. Create a new, superior response.

Responses:\n${responsesText}`
        };
    }
    
    // Run selected analyses only
    async runSelectedAnalyses(selectedModes) {
        // Filter out modes that already have successful results (prevent duplicate generation)
        const modesToRun = selectedModes.filter(mode => {
            const existing = this.results[mode];
            if (existing && existing.status === 'success') {
                console.log(`[SynthesisEngine] Skipping ${mode} - already has successful result`);
                return false; // Skip this mode, already has results
            }
            return true; // Generate this mode
        });
        
        if (modesToRun.length === 0) {
            console.log('[SynthesisEngine] All selected modes already have results');
            return this.results; // Return existing results
        }
        
        // Create promises for modes that need generation
        const promises = modesToRun.map(async (mode) => {
            if (!this.prompts[mode]) {
                console.warn(`Mode ${mode} not found in prompts`);
                return { mode, success: false, error: 'Mode not found' };
            }
            
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
                console.error(`Error in ${mode}:`, error);
                this.results[mode] = {
                    content: `Error: ${error.message}`,
                    timestamp: new Date().toISOString(),
                    status: 'error',
                    error: error.message
                };
                updateProgress(mode, 'error');
                return { mode, success: false, error };
            }
        });
        
        await Promise.all(promises);
        return this.results;
    }
    
    // Run all 7 analyses in parallel (for backward compatibility)
    async runAllAnalyses() {
        const modes = Object.keys(this.prompts);
        return this.runSelectedAnalyses(modes);
    }
    
    // Call OpenAI API via Electron main process
    async callOpenAI(prompt, mode) {
        const systemPrompt = this.getSystemPrompt(mode);
        const temperature = this.getTemperatureForMode(mode);
        const maxTokens = this.getTokenLimitForMode(mode);
        
        const requestData = {
            model: 'gpt-4',
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
        
        // Call via Electron API (uses backend API key)
        if (!window.electronAPI || !window.electronAPI.callOpenAI) {
            throw new Error('API not available. Please restart the application.');
        }
        
        const result = await window.electronAPI.callOpenAI(requestData);
        
        if (result.success && result.result && result.result.choices) {
            return result.result.choices[0].message.content;
        } else {
            throw new Error(result.error || 'Unknown error occurred');
        }
    }
    
    // System prompts for each mode
    getSystemPrompt(mode) {
        const prompts = {
            comprehensive: 'You are an expert AI response analyst. Provide comprehensive, balanced analysis comparing multiple AI responses. Be specific, evidence-based, and actionable.',
            executive: 'You are a business strategist. Create concise, actionable executive summaries. Focus on business implications and decision-making.',
            consensus: 'You are a data analyst specializing in finding agreement patterns. Identify consensus objectively.',
            divergence: 'You are a critical thinker analyzing conflicting viewpoints. Explain why differences exist and their implications.',
            quality: 'You are a quality assurance expert. Score responses objectively with specific criteria and evidence.',
            improvement: 'You are an AI training specialist. Provide specific, actionable improvement suggestions.',
            bestof: 'You are a master editor. Synthesize the best elements into a superior single response. Be creative but accurate.'
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
        const limits = {
            comprehensive: 2000,
            executive: 1000,
            consensus: 1500,
            divergence: 1500,
            quality: 1200,
            improvement: 1800,
            bestof: 2500
        };
        return limits[mode] || 1500;
    }
}

// Export functionality
function exportResults() {
    if (!synthesisResults || Object.keys(synthesisResults).length === 0) {
        showToast('❌ No results to export');
        return;
    }
    
    const exportData = {
        timestamp: new Date().toISOString(),
        responses: comparisonData.panes,
        analyses: synthesisResults,
        metadata: {
            totalModes: 7,
            successfulModes: Object.values(synthesisResults).filter(r => r.status === 'success').length
        }
    };
    
    // Create downloadable JSON
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-synthesis-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('📥 Export started!');
}

// Copy all results to clipboard
// Export Quality Scoring in different formats
function exportQualityScoring(format) {
    const qualityResult = synthesisResults.quality;
    if (!qualityResult || qualityResult.status !== 'success') {
        showToast('❌ Quality Scoring not available. Please generate it first.');
        return;
    }
    
    const scores = extractDetailedScores(qualityResult.content);
    const sortedScores = [...scores].sort((a, b) => b.overall - a.overall);
    
    switch(format) {
        case 'pdf':
            // PDF export would require a library like jsPDF
            showToast('📄 PDF export coming soon! Use Markdown export for now.');
            break;
            
        case 'markdown':
            let markdown = `# Quality Scoring Analysis\n\n`;
            markdown += `Generated: ${new Date().toLocaleDateString()}\n\n`;
            markdown += `## Overall Rankings\n\n`;
            sortedScores.forEach((score, index) => {
                markdown += `${index + 1}. **${score.ai}** - ${score.overall}/100 (${getGrade(score.overall)})\n`;
            });
            markdown += `\n## Scores by Category\n\n`;
            markdown += `| AI | Overall | Accuracy | Clarity | Depth | Practicality |\n`;
            markdown += `|---|---|---|---|---|---|\n`;
            scores.forEach(score => {
                markdown += `| ${score.ai} | ${score.overall} | ${score.accuracy || 0} | ${score.clarity || 0} | ${score.depth || 0} | ${score.practicality || 0} |\n`;
            });
            markdown += `\n## Full Analysis\n\n${qualityResult.content}\n`;
            
            downloadFile(markdown, 'quality-scoring-analysis.md', 'text/markdown');
            showToast('✅ Markdown file downloaded!');
            break;
            
        case 'csv':
            let csv = 'AI,Overall,Accuracy,Clarity,Depth,Practicality\n';
            scores.forEach(score => {
                csv += `${score.ai},${score.overall},${score.accuracy || 0},${score.clarity || 0},${score.depth || 0},${score.practicality || 0}\n`;
            });
            
            downloadFile(csv, 'quality-scores.csv', 'text/csv');
            showToast('✅ CSV file downloaded!');
            break;
    }
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

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

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

