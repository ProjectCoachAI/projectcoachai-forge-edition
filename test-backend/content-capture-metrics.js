/**
 * Content Capture Metrics System
 * 
 * Reusable metrics and validation for capturing full AI responses
 * Works with all current and future AI tools
 */

class ContentCaptureMetrics {
    constructor(provider, prompt) {
        this.provider = provider;
        this.prompt = prompt;
        this.metrics = {
            timestamp: new Date().toISOString(),
            provider: provider,
            promptLength: prompt?.length || 0,
            stages: {}
        };
    }

    /**
     * Record metrics at a specific stage of the capture process
     * @param {string} stage - Stage name (e.g., 'api_raw', 'after_extraction', 'final')
     * @param {string} content - Content at this stage
     * @param {object} metadata - Additional metadata (tokens, parts, etc.)
     */
    recordStage(stage, content, metadata = {}) {
        const contentLength = content?.length || 0;
        const wordCount = content ? content.split(/\s+/).filter(w => w.length > 0).length : 0;
        
        this.metrics.stages[stage] = {
            length: contentLength,
            wordCount: wordCount,
            timestamp: new Date().toISOString(),
            ...metadata
        };

        // Calculate loss from previous stage
        if (Object.keys(this.metrics.stages).length > 1) {
            const previousStage = Object.keys(this.metrics.stages)
                .slice(0, -1)
                .pop();
            const previousLength = this.metrics.stages[previousStage].length;
            const loss = previousLength - contentLength;
            const lossPercent = previousLength > 0 ? ((loss / previousLength) * 100).toFixed(2) : 0;
            
            this.metrics.stages[stage].lossFromPrevious = loss;
            this.metrics.stages[stage].lossPercent = lossPercent;
            
            if (loss > 0 && lossPercent > 5) {
                console.warn(`⚠️ [Metrics] ${this.provider} - ${stage}: Lost ${loss} chars (${lossPercent}%) from ${previousStage}`);
            }
        }

        console.log(`📊 [Metrics] ${this.provider} - ${stage}: ${contentLength} chars, ${wordCount} words`);
    }

    /**
     * Validate that content capture is complete
     * @returns {object} Validation result with warnings/errors
     */
    validate() {
        const stages = Object.keys(this.metrics.stages);
        if (stages.length === 0) {
            return { valid: false, errors: ['No stages recorded'] };
        }

        const finalStage = stages[stages.length - 1];
        const finalLength = this.metrics.stages[finalStage].length;
        const apiRawStage = stages.find(s => s.includes('api_raw') || s.includes('raw'));
        
        const warnings = [];
        const errors = [];

        // Check if we have an API raw stage to compare against
        if (apiRawStage) {
            const rawLength = this.metrics.stages[apiRawStage].length;
            const loss = rawLength - finalLength;
            const lossPercent = rawLength > 0 ? ((loss / rawLength) * 100).toFixed(2) : 0;

            // Expected loss from cleaning (removing UI elements, etc.) should be reasonable
            if (lossPercent > 30) {
                errors.push(`Significant content loss: ${loss} chars (${lossPercent}%) from raw API response`);
            } else if (lossPercent > 10) {
                warnings.push(`Content reduction: ${loss} chars (${lossPercent}%) - may be expected from cleaning`);
            }
        }

        // Check for unexpected truncation
        stages.forEach((stage, index) => {
            if (index > 0) {
                const prevStage = stages[index - 1];
                const prevLength = this.metrics.stages[prevStage].length;
                const currLength = this.metrics.stages[stage].length;
                const loss = prevLength - currLength;
                
                // If we're gaining content (e.g., from concatenation), that's fine
                // But if we're losing more than 5% unexpectedly, warn
                if (loss > 0 && (loss / prevLength) > 0.05 && !stage.includes('clean')) {
                    warnings.push(`${stage}: Lost ${loss} chars from ${prevStage} (unexpected)`);
                }
            }
        });

        return {
            valid: errors.length === 0,
            warnings,
            errors,
            finalLength,
            metrics: this.metrics
        };
    }

    /**
     * Get summary of capture metrics
     */
    getSummary() {
        const stages = Object.keys(this.metrics.stages);
        const finalStage = stages[stages.length - 1];
        const finalLength = this.metrics.stages[finalStage]?.length || 0;
        const apiRawStage = stages.find(s => s.includes('api_raw') || s.includes('raw'));
        const rawLength = apiRawStage ? this.metrics.stages[apiRawStage].length : null;

        return {
            provider: this.provider,
            finalLength,
            rawLength,
            totalLoss: rawLength ? rawLength - finalLength : null,
            lossPercent: rawLength ? (((rawLength - finalLength) / rawLength) * 100).toFixed(2) : null,
            stages: stages.length,
            validation: this.validate()
        };
    }

    /**
     * Export metrics for logging/debugging
     */
    export() {
        return {
            ...this.metrics,
            summary: this.getSummary(),
            validation: this.validate()
        };
    }
}

module.exports = ContentCaptureMetrics;









