#!/usr/bin/env node
// create-admin-accounts.js - Create 4 admin test accounts with specific tiers
// This script creates accounts in the same format as the registration handler

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Generate a secure random password
function generatePassword(length = 12) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    const randomBytes = crypto.randomBytes(length);
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset[randomBytes[i] % charset.length];
    }
    return password;
}

// Hash password (same as main.js)
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Determine userData path based on OS
const os = require('os');
const userDataPath = process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'projectcoachai-forge-edition-v1')
    : path.join(os.homedir(), 'Library', 'Application Support', 'projectcoachai-forge-edition-v1');

// Create directory if it doesn't exist
if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}

const usersPath = path.join(userDataPath, 'users.json');
const subscriptionPath = path.join(userDataPath, 'subscription.json');

// Admin accounts to create
const adminAccounts = [
    { email: 'starter@projectcoachai.com', name: 'Starter Admin', tier: 'starter' },
    { email: 'creator@projectcoachai.com', name: 'Creator Admin', tier: 'lite' },
    { email: 'professional@projectcoachai.com', name: 'Professional Admin', tier: 'pro' },
    { email: 'team@projectcoachai.com', name: 'Team Admin', tier: 'team' }
];

// Load existing users or create new
let users = {};
if (fs.existsSync(usersPath)) {
    users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
}

// Load existing subscriptions or create new
let subscriptions = {};
if (fs.existsSync(subscriptionPath)) {
    subscriptions = JSON.parse(fs.readFileSync(subscriptionPath, 'utf8'));
}

const passwords = {};

console.log('🔐 Creating admin accounts...\n');

adminAccounts.forEach(account => {
    // Generate password
    const password = generatePassword(12);
    passwords[account.email] = password;
    
    // Check if user already exists
    if (users[account.email]) {
        console.log(`⚠️  Account already exists: ${account.email}`);
        console.log(`   Skipping creation. Existing user ID: ${users[account.email].userId}\n`);
        return;
    }
    
    // Create user account (same format as register-user handler)
    const userId = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password);
    
    users[account.email] = {
        userId,
        name: account.name,
        email: account.email,
        passwordHash,
        createdAt: new Date().toISOString(),
        stripeCustomerId: null,
        isAdmin: true // Mark as admin
    };
    
    // Create subscription for this user
    subscriptions[account.email] = {
        tier: account.tier,
        registered: true,
        status: 'active',
        expiresAt: null, // Never expires
        stripeCustomerId: null,
        stripeSubscriptionId: null
    };
    
    console.log(`✅ Created: ${account.name}`);
    console.log(`   Email: ${account.email}`);
    console.log(`   Tier: ${account.tier}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Password: ${password}\n`);
});

// Save users
fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
console.log(`💾 Saved users to: ${usersPath}`);

// Save subscriptions
fs.writeFileSync(subscriptionPath, JSON.stringify(subscriptions, null, 2), 'utf8');
console.log(`💾 Saved subscriptions to: ${subscriptionPath}\n`);

// Display password summary
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 ADMIN ACCOUNT PASSWORDS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

adminAccounts.forEach(account => {
    console.log(`${account.email}`);
    console.log(`  Password: ${passwords[account.email]}`);
    console.log(`  Tier: ${account.tier}`);
    console.log('');
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ All admin accounts created successfully!');
console.log('   These accounts can now be used to sign in to the app.');
