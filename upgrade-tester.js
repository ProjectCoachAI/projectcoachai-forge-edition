#!/usr/bin/env node
// upgrade-tester.js - Upgrade a tester account to a specific tier without payment
// Usage: node upgrade-tester.js <email> <tier>
// Example: node upgrade-tester.js jessica.jones@example.com team

const fs = require('fs');
const path = require('path');
const os = require('os');

const email = process.argv[2];
const tier = process.argv[3] || 'team'; // Default to team tier for testers

if (!email) {
    console.error('Usage: node upgrade-tester.js <email> <tier>');
    console.error('Example: node upgrade-tester.js jessica.jones@example.com team');
    process.exit(1);
}

const validTiers = ['starter', 'lite', 'pro', 'team', 'enterprise'];
if (!validTiers.includes(tier)) {
    console.error(`Invalid tier: ${tier}`);
    console.error(`Valid tiers: ${validTiers.join(', ')}`);
    process.exit(1);
}

// Determine userData path based on OS
const userDataPath = process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'projectcoachai-forge-edition-v1')
    : path.join(os.homedir(), 'Library', 'Application Support', 'projectcoachai-forge-edition-v1');

const usersPath = path.join(userDataPath, 'users.json');
const subscriptionPath = path.join(userDataPath, 'subscription.json');

// Read users.json
if (!fs.existsSync(usersPath)) {
    console.error(`❌ Users file not found: ${usersPath}`);
    console.error('User may not have registered yet.');
    process.exit(1);
}

const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));

if (!users[email]) {
    console.error(`❌ User not found: ${email}`);
    console.error('Available users:', Object.keys(users).join(', '));
    process.exit(1);
}

const user = users[email];
console.log(`✅ Found user: ${user.name} (${user.email})`);
console.log(`   User ID: ${user.userId}`);

// Update subscription
let subscription = {
    tier: tier,
    registered: true,
    status: 'active',
    expiresAt: null, // Never expires for testers
    stripeCustomerId: null,
    stripeSubscriptionId: null
};

if (fs.existsSync(subscriptionPath)) {
    const existing = JSON.parse(fs.readFileSync(subscriptionPath, 'utf8'));
    subscription = { ...existing, ...subscription };
}

fs.writeFileSync(subscriptionPath, JSON.stringify(subscription, null, 2), 'utf8');

console.log(`✅ Upgraded ${user.name} to ${tier} tier`);
console.log(`   Subscription saved to: ${subscriptionPath}`);
console.log(`\n📋 User can now use all features in the ${tier} tier.`);
console.log(`   They may need to restart the app for changes to take effect.`);
