#!/usr/bin/env node

// Quick script to make a user an admin
// Usage: node make-admin.js your-email@example.com

const fs = require('fs');
const path = require('path');

const usersFile = path.join(__dirname, 'data', 'users.json');

if (!fs.existsSync(usersFile)) {
    console.error('❌ users.json file not found!');
    process.exit(1);
}

const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
const email = process.argv[2];

if (!email) {
    console.log('📋 Current users:');
    users.forEach(user => {
        console.log(`  - ${user.email} (${user.role || 'user'})`);
    });
    console.log('\n💡 Usage: node make-admin.js your-email@example.com');
    process.exit(0);
}

const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

if (user) {
    const wasAdmin = user.role === 'admin';
    user.role = 'admin';
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    
    if (wasAdmin) {
        console.log(`✅ ${email} is already an admin!`);
    } else {
        console.log(`✅ ${email} is now an admin!`);
        console.log('   You can now access the admin dashboard.');
    }
} else {
    console.log(`❌ User ${email} not found.`);
    console.log('\n📋 Available users:');
    users.forEach(u => {
        console.log(`  - ${u.email} (${u.role || 'user'})`);
    });
    console.log('\n💡 Tip: Register first at http://localhost:4242/auth.html');
    process.exit(1);
}

