# Pricing Sustainability & Monitoring Guide

## 🎯 Overview

This document outlines how we monitor API pricing, detect changes, and maintain sustainable costs for ProjectCoachAI's synthesis feature.

## 📊 Current Pricing (Updated: January 10, 2025)

### Free Tier (Claude 3.5 Haiku)
- **Model**: `claude-3-5-haiku-20241022`
- **Input**: $1 per 1M tokens
- **Output**: $5 per 1M tokens
- **Estimated per synthesis**: ~$0.005 (1000 input + 800 output tokens)
- **Monthly cost (10K syntheses)**: ~$50

### Paid Tier (Claude 3.5 Sonnet)
- **Model**: `claude-3-5-sonnet-20241022`
- **Input**: $3 per 1M tokens
- **Output**: $15 per 1M tokens
- **Estimated per synthesis**: ~$0.0225 (1500 input + 1200 output tokens)
- **Monthly cost (625 syntheses)**: ~$14.06

## 🚨 How We Detect Price Changes

### 1. **Automated Monitoring** (Recommended)

The `pricing-monitor.js` system tracks actual costs vs. estimates:

```javascript
// After each API call, track actual usage
const cost = pricingMonitor.logUsage(
    'anthropic',
    'claude-3-5-haiku-20241022',
    response.usage.input_tokens,
    response.usage.output_tokens,
    'comprehensive'
);

// System automatically alerts if costs deviate >20% from estimates
```

**Alerts trigger when:**
- Actual cost is 20%+ different from estimate (medium alert)
- Actual cost is 50%+ different from estimate (high alert)
- Model returns 404 (deprecation likely)

### 2. **Manual Price Checks** (Weekly Recommended)

**Check Anthropic Pricing:**
- URL: https://docs.anthropic.com/en/api/pricing
- Check for: Price changes, new models, deprecation notices
- Frequency: Weekly

**Check Model Deprecations:**
- URL: https://docs.anthropic.com/en/docs/about-claude/model-deprecations
- Check for: Model retirement notices
- Frequency: Weekly

**Check OpenAI Pricing (Fallback):**
- URL: https://openai.com/pricing
- Frequency: Monthly (less frequent changes)

### 3. **Cost Variance Alerts**

The system automatically monitors cost variance:

```javascript
// View recent cost alerts
const stats = pricingMonitor.getUsageStats(30); // Last 30 days
console.log(`Cost alerts: ${stats.alerts}`);
console.log(`Avg cost per synthesis: $${stats.avgCostPerSynthesis}`);
```

## 🔄 Model Deprecation Strategy

### Current Status (January 2025)

✅ **Supported Models:**
- `claude-3-5-haiku-20241022` - Latest Haiku
- `claude-3-5-sonnet-20241022` - Latest Sonnet 3.5 (recommended)
- `claude-sonnet-4-20250514` - Sonnet 4 (premium option)

❌ **Deprecated Models:**
- `claude-3-haiku-20240307` - ❌ Use `claude-3-5-haiku-20241022`
- `claude-3-sonnet-20240229` - ❌ Use `claude-3-5-sonnet-20241022`
- `claude-3-opus-20240229` - ❌ Use `claude-3-5-sonnet-20241022`

### Deprecation Detection

```javascript
// Check if model is deprecated
const status = checkModelDeprecation('anthropic', 'claude-3-haiku-20240307');
if (status.isDeprecated) {
    console.warn(status.recommendation);
    const recommended = getRecommendedModel('claude-3-haiku-20240307');
    console.log(`Use: ${recommended}`);
}
```

## 📈 Sustainability Plan

### 1. **Cost Budget** ($100/month)

- Free tier: 10,000 syntheses × $0.005 = **$50**
- Paid tier: 625 syntheses × $0.0225 = **$14.06**
- **Total: ~$64.06** ✅ Under budget with 36% margin

### 2. **Safety Thresholds**

- **Warning**: 70% of budget used ($70)
- **Critical**: 85% of budget used ($85)
- **Emergency**: 95% of budget used ($95) → Disable free tier syntheses

### 3. **Usage Tracking**

```javascript
// Get usage statistics
const stats = pricingMonitor.getUsageStats(30);
console.log(`
    Last 30 Days:
    - Total syntheses: ${stats.totalSyntheses}
    - Total cost: $${stats.totalCost}
    - Avg cost: $${stats.avgCostPerSynthesis}
    - Alerts: ${stats.alerts}
`);
```

## 🔔 Alert System

### Automated Alerts

1. **Cost Variance Alert**
   - Trigger: 20%+ difference from estimate
   - Action: Log warning, review usage

2. **High Cost Variance Alert**
   - Trigger: 50%+ difference from estimate
   - Action: Immediate investigation, possible price change

3. **Model Deprecation Alert**
   - Trigger: API returns 404 for model
   - Action: Update model immediately

4. **Budget Threshold Alerts**
   - Trigger: 70%, 85%, 95% of monthly budget
   - Action: Notify team, consider rate limiting

### Manual Check Reminders

**Weekly Tasks:**
- [ ] Check Anthropic pricing page
- [ ] Review cost variance alerts
- [ ] Check for model deprecation notices

**Monthly Tasks:**
- [ ] Review usage statistics
- [ ] Verify budget vs. actual costs
- [ ] Update pricing config if needed
- [ ] Check OpenAI pricing (fallback)

## 🛠️ Implementation

### Step 1: Integrate Pricing Monitor

```javascript
// In synthesis-engine.js, after API call:
const cost = pricingMonitor.logUsage(
    result.provider || 'claude',
    result.model || claudeModel,
    result.usage?.input_tokens || 0,
    result.usage?.output_tokens || 0,
    mode
);
```

### Step 2: Add Usage Dashboard

Create a usage dashboard that shows:
- Total syntheses this month
- Total cost
- Cost per synthesis (actual vs. estimated)
- Cost alerts
- Model deprecation warnings

### Step 3: Set Up Automated Checks

```javascript
// Daily price check (run in background)
setInterval(async () => {
    const priceCheck = await pricingMonitor.checkPricingUpdates();
    if (priceCheck.changesDetected) {
        // Alert team
        sendAlert('Pricing update detected', priceCheck);
    }
}, 24 * 60 * 60 * 1000); // Daily
```

## 📝 Update Process

### When Pricing Changes:

1. **Detect Change**
   - Automated alert or manual check
   - Verify on official pricing pages

2. **Update Configuration**
   ```javascript
   // Update synthesis-config.js
   costPerSynthesis: 0.006, // Updated from 0.005
   ```

3. **Update Pricing Monitor**
   ```javascript
   // Update pricing-monitor.js
   'claude-3-5-haiku-20241022': {
       input: 1.2,  // Updated from 1
       output: 6,   // Updated from 5
       lastUpdated: '2025-01-15', // New date
   }
   ```

4. **Recalculate Budget**
   - Update monthly cost estimates
   - Adjust safety thresholds if needed

5. **Notify Team**
   - Email/Slack notification
   - Update documentation
   - Review pricing strategy

### When Model Deprecated:

1. **Immediate Action**
   - Update model name in code
   - Test with new model
   - Deploy update

2. **Use Recommended Model**
   ```javascript
   const recommended = getRecommendedModel('claude-3-haiku-20240307');
   // Returns: 'claude-3-5-haiku-20241022'
   ```

## 🔗 Resources

- **Anthropic Pricing**: https://docs.anthropic.com/en/api/pricing
- **Anthropic Deprecations**: https://docs.anthropic.com/en/docs/about-claude/model-deprecations
- **OpenAI Pricing**: https://openai.com/pricing
- **Model Status**: Check pricing pages for current model availability

## ✅ Checklist for Sustainability

- [x] Current pricing tracked in `pricing-monitor.js`
- [x] Cost variance detection implemented
- [x] Model deprecation checking
- [x] Usage statistics tracking
- [ ] Automated price checking (TODO: implement web scraping)
- [ ] Budget threshold alerts (TODO: integrate with notification system)
- [ ] Usage dashboard (TODO: create admin dashboard)
- [ ] Weekly price check reminder (TODO: set up calendar)

## 💡 Recommendations

1. **Monitor Daily**: Check cost variance alerts daily
2. **Check Weekly**: Manually verify pricing pages weekly
3. **Review Monthly**: Full budget and usage review monthly
4. **Version Pin**: Use specific model versions (not "latest") for stability
5. **Fallback Ready**: Always have fallback models configured
6. **Budget Buffer**: Keep 30%+ buffer for unexpected costs

---

**Last Updated**: January 10, 2025  
**Next Review**: January 17, 2025 (Weekly)
