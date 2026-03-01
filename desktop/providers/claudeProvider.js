const CLAUDE_PROVIDER_ID = 'claude';

const CLAUDE_COMPOSER_SELECTORS = Object.freeze([
    'div.ProseMirror[contenteditable="true"]',
    'div.ProseMirror',
    'div[role="textbox"][contenteditable="true"]',
    'div[contenteditable="plaintext-only"]',
    'div[contenteditable="true"][data-placeholder]',
    'main [contenteditable="true"]',
    'main form textarea',
    'form textarea',
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="Reply"]'
]);

const CLAUDE_POLLER_SELECTORS = Object.freeze([
    '[data-testid*="assistant"]',
    '[class*="assistant"] [class*="prose"]',
    '[data-role="assistant"]',
    '[class*="Message--assistant"]',
    '[class*="assistant-message"]',
    '[class*="AssistantMessage"]',
    'div[class*="Message"]:not([class*="user"]):not([class*="human"])',
    'main [class*="font-claude-message"]',
    'main article [class*="prose"]',
    'main .prose'
]);

const CLAUDE_DEFAULT_LANDING_TOKENS = Object.freeze([
    'good afternoon',
    'how can i help you today',
    'try claude'
]);

const CLAUDE_CONTAMINATION_TOKENS = Object.freeze([
    'recents',
    'hide details'
]);

function isLikelyClaudeContaminationText(value) {
    const normalizedText = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalizedText) return false;
    const locationCount = (normalizedText.match(/location/g) || []).length;
    const hasContaminationToken = CLAUDE_CONTAMINATION_TOKENS.some((token) => normalizedText.includes(token));
    return hasContaminationToken || locationCount >= 6;
}

module.exports = {
    CLAUDE_PROVIDER_ID,
    CLAUDE_COMPOSER_SELECTORS,
    CLAUDE_POLLER_SELECTORS,
    CLAUDE_DEFAULT_LANDING_TOKENS,
    CLAUDE_CONTAMINATION_TOKENS,
    isLikelyClaudeContaminationText
};
