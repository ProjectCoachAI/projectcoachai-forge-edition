#!/usr/bin/env node
// reset-admin-passwords.js - Reset passwords for existing admin accounts
// This script updates passwords for existing admin accounts and displays them

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

const usersPath = path.join(userDataPath, 'users.json');

// Admin accounts to reset
const adminAccounts = [
    { email: 'starter@projectcoachai.com', name: 'Starter Admin', tier: 'starter' },
    { email: 'creator@projectcoachai.com', name: 'Creator Admin', tier: 'lite' },
    { email: 'professional@projectcoachai.com', name: 'Professional Admin', tier: 'pro' },
    { email: 'team@projectcoachai.com', name: 'Team Admin', tier: 'team' }
];

// Load existing users
if (!fs.existsSync(usersPath)) {
    console.error('❌ Error: users.json not found at:', usersPath);
    console.error('   Please create admin accounts first using create-admin-accounts.js');
    process.exit(1);
}

const data = fs.readFileSync(usersPath, 'utf8');
const users = JSON.parse(data);

const passwords = {};

console.log('🔐 Resetting admin account passwords...\n');

let resetCount = 0;

adminAccounts.forEach(account => {
    const user = users[account.email];
    
    if (!user) {
        console.log(`⚠️  Account not found: ${account.email}`);
        console.log(`   Skipping password reset.\n`);
        return;
    }
    
    if (!user.isAdmin) {
        console.log(`⚠️  Account exists but is not an admin: ${account.email}`);
        console.log(`   Skipping password reset.\n`);
        return;
    }
    
    // Generate new password
    const password = generatePassword(12);
    passwords[account.email] = password;
    
    // Update password hash
    user.passwordHash = hashPassword(password);
    
    console.log(`✅ Reset password for: ${account.name}`);
    console.log(`   Email: ${account.email}`);
    console.log(`   User ID: ${user.userId}`);
    console.log(`   New Password: ${password}\n`);
    
    resetCount++;
});

if (resetCount === 0) {
    console.log('❌ No admin accounts found to reset.');
    console.log('   Make sure the accounts exist and have isAdmin: true\n');
    process.exit(1);
}

// Save updated users
fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
console.log(`💾 Updated users.json at: ${usersPath}\n`);

// Display password summary
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 ADMIN ACCOUNT PASSWORDS (RESET)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

adminAccounts.forEach(account => {
    if (passwords[account.email]) {
        console.log(`${account.email}`);
        console.log(`  Password: ${passwords[account.email]}`);
        console.log(`  Tier: ${account.tier}`);
        console.log('');
    }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✅ Successfully reset passwords for ${resetCount} admin account(s)!`);
console.log('   These passwords can now be used to sign in to the app.');
console.log('   ⚠️  IMPORTANT: Save these passwords securely - they cannot be retrieved again!');


