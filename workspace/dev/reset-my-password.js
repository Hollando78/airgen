const crypto = require('crypto');
const fs = require('fs');

// Reset password for your account
const email = process.argv[2] || "steven.holland@outlook.com";
const password = "password123";  // Change this if you want

// Generate scrypt hash
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');

// Read existing users
const users = JSON.parse(fs.readFileSync('/root/airgen/workspace/dev/dev-users.json', 'utf8'));

// Find and update user
const userIndex = users.findIndex(u => u.email === email);
if (userIndex === -1) {
  console.error(`User ${email} not found`);
  process.exit(1);
}

users[userIndex].passwordHash = hash;
users[userIndex].passwordSalt = salt;
users[userIndex].updatedAt = new Date().toISOString();

// Write back
fs.writeFileSync('/root/airgen/workspace/dev/dev-users.json', JSON.stringify(users, null, 2) + '\n');
console.log(`✓ Password reset for ${email}`);
console.log(`  New password: ${password}`);
console.log(`\nYou can now log in with:`);
console.log(`  Email: ${email}`);
console.log(`  Password: ${password}`);
