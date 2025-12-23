// Quick script to update a user's role
// Run this on Railway to update bensonpampackal548@gmail.com to admin

const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, 'data', 'users.json');

try {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const userIndex = users.findIndex(u => u.email === 'bensonpampackal548@gmail.com');
    
    if (userIndex === -1) {
        console.log('❌ User not found');
        process.exit(1);
    }
    
    users[userIndex].role = 'admin';
    users[userIndex].roleUpdatedAt = new Date().toISOString();
    users[userIndex].roleUpdatedBy = 'system';
    
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
    console.log('✅ User role updated to admin successfully!');
    console.log('User:', users[userIndex].email);
    console.log('Role:', users[userIndex].role);
} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}

