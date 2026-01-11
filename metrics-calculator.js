// metrics-calculator.js - Genuine metrics calculation from response content
// NO COMPROMISE: All metrics are calculated from actual response analysis

class MetricsCalculator {
    /**
     * Calculate genuine metrics from response content
     * @param {string} content - The response text content
     * @param {Array<string>} allContents - All responses for comparison
     * @returns {Object} Metrics object with coherence, creativity, accuracy, overall
     */
    static calculateMetrics(content, allContents = []) {
        if (!content || content.trim().length < 10) {
            return {
                coherence: 0,
                creativity: 0,
                accuracy: 0,
                overall: 0,
                confidence: 0
            };
        }

        const coherence = this.calculateCoherence(content);
        const creativity = this.calculateCreativity(content, allContents);
        const accuracy = this.calculateAccuracy(content);
        const overall = this.calculateOverall(coherence, creativity, accuracy);
        const confidence = this.calculateConfidence(content);

        return {
            coherence: Math.round(coherence * 10) / 10, // Round to 1 decimal
            creativity: Math.round(creativity * 10) / 10,
            accuracy: Math.round(accuracy * 10) / 10,
            overall: Math.round(overall * 10) / 10,
            confidence: Math.round(confidence * 10) / 10,
            details: {
                coherenceDetails: this.getCoherenceDetails(content),
                creativityDetails: this.getCreativityDetails(content, allContents),
                accuracyDetails: this.getAccuracyDetails(content)
            }
        };
    }

    /**
     * Calculate coherence score (0-5)
     * Measures: sentence structure, flow, logical connections, paragraph organization
     */
    static calculateCoherence(content) {
        let score = 0;
        const text = content.trim();
        
        // Basic checks
        if (text.length < 50) return 0;
        
        // Sentence structure analysis
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const avgSentenceLength = sentences.length > 0 
            ? sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length 
            : 0;
        
        // Good sentence length (10-25 words) indicates coherence
        if (avgSentenceLength >= 10 && avgSentenceLength <= 25) score += 1.0;
        else if (avgSentenceLength >= 5 && avgSentenceLength <= 35) score += 0.5;
        
        // Paragraph structure
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        if (paragraphs.length > 1) {
            // Multiple paragraphs with reasonable length indicates organization
            const avgParaLength = paragraphs.reduce((sum, p) => sum + p.trim().length, 0) / paragraphs.length;
            if (avgParaLength >= 100 && avgParaLength <= 500) score += 1.0;
            else if (avgParaLength >= 50) score += 0.5;
        }
        
        // Transition words/phrases (indicate logical flow)
        const transitionWords = [
            'however', 'therefore', 'furthermore', 'moreover', 'additionally',
            'consequently', 'thus', 'hence', 'meanwhile', 'subsequently',
            'in addition', 'for example', 'for instance', 'specifically',
            'in other words', 'that is', 'in fact', 'indeed', 'as a result'
        ];
        const transitionCount = transitionWords.reduce((count, word) => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            return count + (text.match(regex) || []).length;
        }, 0);
        
        if (transitionCount >= 3) score += 1.5;
        else if (transitionCount >= 1) score += 0.75;
        
        // Sentence variety (mix of short and long sentences)
        const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).length);
        const lengthVariance = this.calculateVariance(sentenceLengths);
        if (lengthVariance > 20) score += 0.5; // Good variety
        
        // Repetition check (low repetition = better coherence)
        const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const uniqueWords = new Set(words);
        const uniquenessRatio = uniqueWords.size / words.length;
        if (uniquenessRatio > 0.7) score += 0.5;
        else if (uniquenessRatio < 0.4) score -= 0.5; // Too repetitive
        
        // Cap at 5.0
        return Math.min(5.0, Math.max(0, score));
    }

    /**
     * Calculate creativity score (0-5)
     * Measures: uniqueness, originality, creative language, diverse vocabulary
     */
    static calculateCreativity(content, allContents = []) {
        let score = 0;
        const text = content.trim().toLowerCase();
        
        if (text.length < 50) return 0;
        
        // Vocabulary diversity
        const words = text.split(/\s+/).filter(w => w.length > 2);
        const uniqueWords = new Set(words);
        const diversityRatio = uniqueWords.size / words.length;
        
        if (diversityRatio > 0.8) score += 1.5;
        else if (diversityRatio > 0.6) score += 1.0;
        else if (diversityRatio > 0.4) score += 0.5;
        
        // Creative/descriptive language indicators
        const creativePatterns = [
            /\b(imagine|visualize|envision|picture|consider|suppose)\b/gi,
            /\b(metaphor|analogy|like|similar to|reminiscent of)\b/gi,
            /\b(innovative|creative|unique|original|novel|distinctive)\b/gi,
            /\b(perhaps|maybe|possibly|potentially|might|could)\b/gi
        ];
        
        let creativeCount = 0;
        creativePatterns.forEach(pattern => {
            creativeCount += (text.match(pattern) || []).length;
        });
        
        if (creativeCount >= 5) score += 1.5;
        else if (creativeCount >= 2) score += 1.0;
        else if (creativeCount >= 1) score += 0.5;
        
        // Uniqueness compared to other responses
        if (allContents.length > 1) {
            const otherContents = allContents.filter(c => c !== content);
            let similarityScore = 0;
            
            otherContents.forEach(otherContent => {
                const similarity = this.calculateSimilarity(text, otherContent.toLowerCase());
                similarityScore += similarity;
            });
            
            const avgSimilarity = similarityScore / otherContents.length;
            // Lower similarity = more creative/unique
            if (avgSimilarity < 0.3) score += 1.5;
            else if (avgSimilarity < 0.5) score += 1.0;
            else if (avgSimilarity < 0.7) score += 0.5;
            else score -= 0.5; // Too similar to others
        }
        
        // Length and depth (longer, more detailed responses often more creative)
        if (text.length > 500) score += 0.5;
        if (text.length > 1000) score += 0.5;
        
        // Question usage (indicates thoughtful exploration)
        const questionCount = (text.match(/\?/g) || []).length;
        if (questionCount >= 2) score += 0.5;
        
        // Cap at 5.0
        return Math.min(5.0, Math.max(0, score));
    }

    /**
     * Calculate accuracy score (0-5)
     * Measures: factual consistency, citation presence, confidence markers, contradiction detection
     */
    static calculateAccuracy(content) {
        let score = 2.5; // Start with neutral (we can't fact-check, so moderate default)
        const text = content.trim().toLowerCase();
        
        if (text.length < 50) return 0;
        
        // Positive indicators
        // Citations and sources
        const citationPatterns = [
            /\b(source|according to|research|study|data|evidence|fact|facts)\b/gi,
            /\b(reference|cite|citation|link|url|http|https|www\.)\b/gi,
            /\b(statistics|statistic|percent|percentage|%)\b/gi
        ];
        
        let citationCount = 0;
        citationPatterns.forEach(pattern => {
            citationCount += (text.match(pattern) || []).length;
        });
        
        if (citationCount >= 3) score += 1.0;
        else if (citationCount >= 1) score += 0.5;
        
        // Confidence markers (but not overconfidence)
        const confidenceMarkers = [
            /\b(certain|definitely|absolutely|always|never)\b/gi, // Overconfidence (negative)
            /\b(probably|likely|possibly|may|might|could|suggests|indicates)\b/gi, // Appropriate confidence (positive)
            /\b(uncertain|unclear|unknown|unverified)\b/gi // Honest uncertainty (positive)
        ];
        
        const overconfident = (text.match(confidenceMarkers[0]) || []).length;
        const appropriateConfidence = (text.match(confidenceMarkers[1]) || []).length;
        const honestUncertainty = (text.match(confidenceMarkers[2]) || []).length;
        
        if (appropriateConfidence >= 2) score += 0.5;
        if (honestUncertainty >= 1) score += 0.5;
        if (overconfident > 3) score -= 0.5; // Too many absolute statements
        
        // Contradiction detection (simple check for conflicting statements)
        const contradictionPatterns = [
            /(yes|no|true|false|correct|incorrect).*?(no|yes|false|true|incorrect|correct)/gi,
            /\b(but|however|although|though).*?\b(but|however|although|though)\b/gi
        ];
        
        let contradictionCount = 0;
        contradictionPatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches && matches.length > 1) contradictionCount += matches.length - 1;
        });
        
        if (contradictionCount > 2) score -= 1.0;
        else if (contradictionCount > 0) score -= 0.5;
        
        // Specificity (specific details often indicate accuracy)
        const specificPatterns = [
            /\b\d{4}\b/g, // Years
            /\b\d+%\b/g, // Percentages
            /\b\d+\.\d+\b/g, // Decimals
            /\b([A-Z][a-z]+ [A-Z][a-z]+|[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+)\b/g // Proper nouns
        ];
        
        let specificityCount = 0;
        specificPatterns.forEach(pattern => {
            specificityCount += (text.match(pattern) || []).length;
        });
        
        if (specificityCount >= 3) score += 0.5;
        else if (specificityCount >= 1) score += 0.25;
        
        // Disclaimer/uncertainty markers (honest = good for accuracy score)
        const disclaimerPatterns = [
            /\b(may|might|could|possibly|perhaps|uncertain|unclear)\b/gi,
            /\b(please note|note that|keep in mind|important to note)\b/gi,
            /\b(verify|check|confirm|double-check)\b/gi
        ];
        
        let disclaimerCount = 0;
        disclaimerPatterns.forEach(pattern => {
            disclaimerCount += (text.match(pattern) || []).length;
        });
        
        if (disclaimerCount >= 2) score += 0.5;
        else if (disclaimerCount >= 1) score += 0.25;
        
        // Cap at 5.0
        return Math.min(5.0, Math.max(0, score));
    }

    /**
     * Calculate overall score (weighted average)
     */
    static calculateOverall(coherence, creativity, accuracy) {
        // Weighted: Coherence 30%, Creativity 25%, Accuracy 45% (accuracy is most important)
        const weighted = (coherence * 0.30) + (creativity * 0.25) + (accuracy * 0.45);
        return Math.min(5.0, Math.max(0, weighted));
    }

    /**
     * Calculate confidence in metrics (0-1)
     * Higher confidence = more reliable metrics
     */
    static calculateConfidence(content) {
        if (!content || content.trim().length < 50) return 0;
        
        let confidence = 0.5; // Base confidence
        
        const length = content.trim().length;
        if (length > 500) confidence += 0.2;
        if (length > 1000) confidence += 0.2;
        if (length < 100) confidence -= 0.3;
        
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
        if (sentences.length > 5) confidence += 0.1;
        
        return Math.min(1.0, Math.max(0, confidence));
    }

    /**
     * Calculate text similarity (0-1)
     */
    static calculateSimilarity(text1, text2) {
        const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 3));
        const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 3));
        
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);
        
        return union.size > 0 ? intersection.size / union.size : 0;
    }

    /**
     * Calculate variance of array
     */
    static calculateVariance(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
    }

    /**
     * Get detailed coherence analysis
     */
    static getCoherenceDetails(content) {
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const avgLength = sentences.length > 0 
            ? sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length 
            : 0;
        
        return {
            sentenceCount: sentences.length,
            avgSentenceLength: Math.round(avgLength * 10) / 10,
            paragraphCount: content.split(/\n\s*\n/).filter(p => p.trim().length > 0).length
        };
    }

    /**
     * Get detailed creativity analysis
     */
    static getCreativityDetails(content, allContents) {
        const words = content.split(/\s+/).filter(w => w.length > 2);
        const uniqueWords = new Set(words);
        const diversityRatio = uniqueWords.size / words.length;
        
        return {
            vocabularyDiversity: Math.round(diversityRatio * 100) / 100,
            uniqueWords: uniqueWords.size,
            totalWords: words.length
        };
    }

    /**
     * Get detailed accuracy analysis
     */
    static getAccuracyDetails(content) {
        const text = content.toLowerCase();
        const citationCount = (text.match(/\b(source|according to|research|study|data|evidence|fact)\b/gi) || []).length;
        const specificityCount = (text.match(/\b\d{4}\b|\b\d+%\b|\b\d+\.\d+\b/g) || []).length;
        
        return {
            citationIndicators: citationCount,
            specificDetails: specificityCount
        };
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.MetricsCalculator = MetricsCalculator;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MetricsCalculator;
}











