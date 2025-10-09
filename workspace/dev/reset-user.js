const crypto = require('crypto');

// Create a simple admin user with password "admin123"
const password = "admin123";
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');

const user = {
  id: crypto.randomUUID(),
  email: "admin@test.local",
  name: "Admin User",
  passwordHash: hash,
  passwordSalt: salt,
  roles: ["admin", "user"],
  tenantSlugs: ["admin-dev"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// Read existing users
const fs = require('fs');
const users = JSON.parse(fs.readFileSync('/root/airgen/workspace/dev/dev-users.json', 'utf8'));

// Remove any existing admin@test.local
const filtered = users.filter(u => u.email !== 'admin@test.local');
filtered.push(user);

// Write back
fs.writeFileSync('/root/airgen/workspace/dev/dev-users.json', JSON.stringify(filtered, null, 2));
console.log('Created user admin@test.local with password admin123');
