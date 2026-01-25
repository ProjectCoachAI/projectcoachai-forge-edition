#!/usr/bin/env node
// check-user-status.js - Check if a user is registered/logged in

const fs = require('fs');
const path = require('path');
const os = require('os');

// Determine userData path based on OS
const userDataPath = process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'projectcoachai-forge-edition-v1')
    : path.join(os.homedir(), 'Library', 'Application Support', 'projectcoachai-forge-edition-v1');

const usersPath = path.join(userDataPath, 'users.json');

// Search term
const searchTerm = process.argv[2] || '';

console.log('🔍 Checking User Status...\n');
console.log('User data path:', userDataPath);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (!fs.existsSync(usersPath)) {
    console.log('❌ users.json file does not exist');
    console.log('   No users have registered yet.\n');
    process.exit(1);
}

try {
    const data = fs.readFileSync(usersPath, 'utf8');
    const users = JSON.parse(data);
    
    const userEmails = Object.keys(users);
    console.log(`📊 Total Users: ${userEmails.length}\n`);
    
    if (searchTerm) {
        // Search for specific user
        const searchLower = searchTerm.toLowerCase();
        const foundUsers = userEmails.filter(email => 
            email.toLowerCase().includes(searchLower) ||
            users[email].name.toLowerCase().includes(searchLower)
        );
        
        if (foundUsers.length === 0) {
            console.log(`❌ No user found matching: "${searchTerm}"\n`);
            console.log('Available users:');
            userEmails.forEach(email => {
                console.log(`   - ${users[email].name} (${email})`);
            });
        } else {
            console.log(`✅ Found ${foundUsers.length} user(s) matching "${searchTerm}":\n`);
            foundUsers.forEach(email => {
                const user = users[email];
                console.log(`Name: ${user.name}`);
                console.log(`Email: ${email}`);
                console.log(`User ID: ${user.userId}`);
                console.log(`Created: ${new Date(user.createdAt).toLocaleString()}`);
                console.log(`Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}`);
                console.log(`Admin: ${user.isAdmin ? 'Yes' : 'No'}`);
                console.log('');
            });
        }
    } else {
        // List all users
        console.log('All Registered Users:\n');
        userEmails.forEach(email => {
            const user = users[email];
            const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never';
            console.log(`${user.name}`);
            console.log(`  Email: ${email}`);
            console.log(`  User ID: ${user.userId.substring(0, 16)}...`);
            console.log(`  Created: ${new Date(user.createdAt).toLocaleString()}`);
            console.log(`  Last Login: ${lastLogin}`);
            console.log(`  Type: ${user.isAdmin ? 'Admin' : 'User'}`);
            console.log('');
        });
    }
    
} catch (error) {
    console.error('❌ Error reading users.json:', error.message);
    process.exit(1);
}


