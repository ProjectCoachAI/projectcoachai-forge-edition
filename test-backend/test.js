/**
 * Test script for ResponseExtractor
 * Tests cleaning without needing API keys
 */

const ResponseExtractor = require('../ResponseExtractor');

// Test cases based on your screenshot issues
const testCases = [
    {
        name: 'Claude - Chat History Issue',
        ai: 'claude',
        raw: `Millionsire and billionaire population percentages
Capital of Japan
What percentage of the population are millionaires and billionaires? I'll search for current data on millionaires and billionaires as a percentage of global population.

Based on the latest data:

• Millionaires: Approximately 1.1% of global adult population
• Billionaires: About 0.0001% of global population

Sources: Credit Suisse, UBS reports.`
    },
    {
        name: 'Gemini - Disclaimer Issue',
        ai: 'gemini',
        raw: `Gemini can make mistakes, including about people, so double-check it. You privacy and Gemini Opens in a new window.

- **Tim: You can still edit this response if needed, or use the "Highlight Differ" button to see differences.**

About 1.1% of adults globally are millionaires. Billionaires are much rarer at around 0.0001%.`
    },
    {
        name: 'Perplexity - Search Context Issue',
        ai: 'perplexity',
        raw: `According to search results, the percentage of millionaires globally is approximately 1.1% of adults. For billionaires, it's about 0.0001%.

Sources:
• Credit Suisse Global Wealth Report
• Forbes Billionaires List

[1] https://www.credit-suisse.com
[2] https://www.forbes.com`
    },
    {
        name: 'ChatGPT - Thinking Markers',
        ai: 'chatgpt',
        raw: `Let me think about this...

Here is the answer:

Based on current data, approximately 1.1% of the global adult population are millionaires, and about 0.0001% are billionaires.`
    }
];

console.log('🧪 Testing ResponseExtractor\n');
console.log('='.repeat(60));

testCases.forEach((testCase, index) => {
    console.log(`\n📋 Test ${index + 1}: ${testCase.name}`);
    console.log('-'.repeat(60));
    
    console.log('\n📥 RAW RESPONSE:');
    console.log(testCase.raw);
    console.log(`\n   Length: ${testCase.raw.length} chars`);
    
    // Clean the response
    const cleaned = ResponseExtractor.extract(testCase.ai, testCase.raw);
    
    console.log('\n✨ CLEANED RESPONSE:');
    console.log(cleaned);
    console.log(`\n   Length: ${cleaned.length} chars`);
    console.log(`   Reduction: ${((1 - cleaned.length / testCase.raw.length) * 100).toFixed(1)}%`);
    
    // Validate quality
    const quality = ResponseExtractor.validateResponse(cleaned, testCase.raw.length);
    console.log(`\n📊 Quality Score: ${quality.score}/100`);
    console.log(`   Valid: ${quality.isValid ? '✅' : '❌'}`);
    if (quality.failedChecks.length > 0) {
        console.log(`   Issues: ${quality.failedChecks.join(', ')}`);
    }
    
    // Extract images
    const images = ResponseExtractor.extractImages(testCase.raw, testCase.ai);
    if (images.length > 0) {
        console.log(`\n🖼️  Images found: ${images.length}`);
    }
});

console.log('\n' + '='.repeat(60));
console.log('\n✅ Testing complete!');
console.log('\n💡 Next steps:');
console.log('   1. Start test server: cd test-backend && npm start');
console.log('   2. Test with curl or Postman');
console.log('   3. Update Electron app API_PROXY_URL to http://localhost:3001');











