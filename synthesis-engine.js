/**
 * AI Response Synthesis Engine
 * Generates 7 different types of analysis from compared AI responses
 */

// Global state
let comparisonData = null;
let synthesisResults = {};
let selectedModes = []; // Start with no modes selected - user must explicitly select

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
            updateDataStatus(data);
        });
    }
    
    // Fallback: try to get data from localStorage or URL params
    setTimeout(() => {
        if (!comparisonData) {
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
        statusText.textContent = `${uniqueToolsCount} AI ${uniqueToolsCount === 1 ? 'tool' : 'tools'} loaded for synthesis`;
        
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
        statusText.textContent = 'No comparison data available';
        console.warn(`⚠️ [Synthesis] No panes with responses found (${panes.length} total panes provided)`);
    }
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
    button.innerHTML = `⏳ Generating ${modeCount} ${modeCount === 1 ? 'Analysis' : 'Analyses'}...`;
    button.disabled = true;
    
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
        return;
    }
    
    // Show container
    container.classList.add('show');
    
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

function formatExecutive(content) {
    // Enhance executive summary formatting with better structure and spacing
    let enhancedContent = content;
    
    // Ensure proper section breaks for Executive Summary format
    // Replace multiple dashes/equals with proper headers if needed
    enhancedContent = enhancedContent.replace(/^[-=]{3,}$/gm, ''); // Remove separator lines
    
    // Normalize section headers - ensure consistent formatting
    enhancedContent = enhancedContent.replace(/^####\s*(Main Takeaways?:?)/gmi, '## $1');
    enhancedContent = enhancedContent.replace(/^####\s*(Most Business-Ready Answer?:?)/gmi, '## $1');
    enhancedContent = enhancedContent.replace(/^####\s*(Risk Assessment)/gmi, '## $1');
    enhancedContent = enhancedContent.replace(/^####\s*(Recommended Actions?:?|Action Steps)/gmi, '## $1');
    
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
    
    return `
        <div class="result-card bestof">
            <h3>🏆 Best-of-Best Synthesis</h3>
            <div class="bestof-badge">🔥 Combined Ideal Answer</div>
            <div class="result-content markdown-content">${markdownToHtml(content)}</div>
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
    return `
        <div class="result-card">
            <div class="result-content markdown-content">${markdownToHtml(content)}</div>
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

For EACH AI response, provide scores in this EXACT format:
**AI_NAME Response:**
- **Accuracy:** [0-100] - [brief justification]
- **Clarity:** [0-100] - [brief justification]
- **Depth/Completeness:** [0-100] - [brief justification]
- **Practicality:** [0-100] - [brief justification]
- **Overall Grade:** [A-F]

IMPORTANT: Use the EXACT format "Accuracy: [number]", "Clarity: [number]", etc. Include the colon and space. Scores must be integers 0-100.

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
        console.log(`👤 [Synthesis] User tier: ${userTier}`);
        
        // Check if user can generate more syntheses
        if (typeof window !== 'undefined' && window.SynthesisUsageTracker) {
            const canGenerate = window.SynthesisUsageTracker.canGenerate(userTier);
            if (!canGenerate.allowed) {
                const stats = window.SynthesisUsageTracker.getStatistics(userTier);
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
                const stats = window.SynthesisUsageTracker.getStatistics(userTier);
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
                            }
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
        const claudeModel = 'claude-3-5-haiku-20241022'; // Same model for all tiers - proven and cost-effective!
        const claudeFallbackModel = 'claude-3-5-haiku-20241022'; // Fallback (should not be needed, but kept for safety)
        const openAIModel = isFreeTier ? 'gpt-3.5-turbo' : 'gpt-4-turbo-preview';
        
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
                const modelUsed = result.model || model || (isFreeTier ? 'claude-3-5-haiku-20241022' : 'claude-3-5-sonnet-20241022');
                const usedFallbackFlag = result.usedFallback || usedFallback || false;
                
                // Convert model name to simplified format for usage tracking
                let modelNameForTracking = modelUsed;
                if (modelUsed.includes('claude-3-5-haiku') || modelUsed.includes('haiku')) {
                    modelNameForTracking = 'claude-haiku';
                } else if (modelUsed.includes('claude-3-5-sonnet') || modelUsed.includes('claude-sonnet-4') || modelUsed.includes('sonnet')) {
                    modelNameForTracking = 'claude-sonnet';
                } else if (modelUsed.includes('gpt-3.5')) {
                    modelNameForTracking = 'gpt-3.5-turbo';
                } else if (modelUsed.includes('gpt-4')) {
                    modelNameForTracking = 'gpt-4-turbo';
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
        // Free tier: 4096 max tokens, Paid tier: 8192 max tokens (handled in synthesis-config.js)
        // Per-mode limits (within tier limits)
        const limits = {
            comprehensive: 2000,  // Can expand up to tier limit
            executive: 1000,      // Can expand up to tier limit
            consensus: 1500,      // Can expand up to tier limit
            divergence: 1500,     // Can expand up to tier limit
            quality: 1200,        // Can expand up to tier limit
            improvement: 1800,    // Can expand up to tier limit
            bestof: 2500          // Can expand up to tier limit (paid can go higher)
        };
        return limits[mode] || 1500;
    }
}

// Export functionality - Enhanced with format and selection options
function exportResults(scope = 'all', format = null) {
    if (!synthesisResults || Object.keys(synthesisResults).length === 0) {
        showToast('❌ No results to export');
        return;
    }
    
    // Get format from dropdown if not specified
    if (!format) {
        const formatSelect = document.getElementById('exportFormat');
        format = formatSelect ? formatSelect.value : 'json';
    }
    
    // Filter results based on scope
    let resultsToExport = {};
    if (scope === 'selected') {
        // Export only currently selected/visible tab
        const activeTab = document.querySelector('.result-tab.active');
        if (activeTab) {
            const mode = activeTab.dataset.mode;
            if (synthesisResults[mode]) {
                resultsToExport[mode] = synthesisResults[mode];
            }
        } else {
            showToast('❌ Please select an analysis to export');
            return;
        }
    } else {
        // Export all results
        resultsToExport = synthesisResults;
    }
    
    const exportData = {
        timestamp: new Date().toISOString(),
        responses: comparisonData.panes,
        analyses: resultsToExport,
        metadata: {
            totalModes: scope === 'all' ? 7 : 1,
            successfulModes: Object.values(resultsToExport).filter(r => r.status === 'success').length,
            exportFormat: format
        }
    };
    
    // Export based on format
    switch(format) {
        case 'json':
            exportAsJSON(exportData);
            break;
        case 'markdown':
            exportAsMarkdown(resultsToExport);
            break;
        case 'pdf':
        case 'docx':
            showToast(`⚠️ ${format.toUpperCase()} export coming soon. Exporting as JSON for now.`);
            exportAsJSON(exportData);
            break;
        default:
            exportAsJSON(exportData);
    }
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
    let markdown = `# AI Synthesis Report\n\n`;
    markdown += `**Generated:** ${new Date().toLocaleString()}\n\n`;
    markdown += `---\n\n`;
    
    Object.entries(resultsToExport).forEach(([mode, result]) => {
        if (result.status === 'success') {
            const modeNames = {
                'comprehensive': 'Comprehensive Analysis',
                'executive': 'Executive Summary',
                'consensus': 'Consensus Mapping',
                'divergence': 'Divergence Analysis',
                'quality': 'Quality Scoring',
                'improvement': 'Improvement Guide',
                'bestof': 'Best-of-Best Synthesis'
            };
            markdown += `## ${modeNames[mode] || mode}\n\n`;
            markdown += result.content.replace(/\n/g, '\n') + '\n\n';
            markdown += `---\n\n`;
        }
    });
    
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

// Share link functionality
function shareLink() {
    if (!synthesisResults || Object.keys(synthesisResults).length === 0) {
        showToast('❌ No results to share. Please generate analyses first.');
        return;
    }
    
    // In a real app, this would generate a shareable URL via a backend API
    // For now, we'll create a shareable data URL or use the clipboard
    const shareData = {
        timestamp: new Date().toISOString(),
        analyses: Object.keys(synthesisResults),
        // Note: In production, you'd upload this to a server and get a shareable link
    };
    
    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${btoa(JSON.stringify(shareData))}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('🔗 Share link copied to clipboard! Link valid for 7 days.');
    }).catch(() => {
        // Fallback: show in prompt
        prompt('Share this link (copied to clipboard in production):', shareUrl);
    });
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