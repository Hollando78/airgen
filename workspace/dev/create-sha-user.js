const crypto = require('crypto');
const fs = require('fs');

// Create user with SHA256 password (old format)
const password = "admin123";
const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

const user = {
  id: crypto.randomUUID(),
  email: "admin@airgen.local",
  name: "Admin User",
  password: hashedPassword,  // Using old SHA256 format
  roles: ["admin", "user"],
  tenantSlugs: ["admin-dev"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// Read existing users
const users = JSON.parse(fs.readFileSync('/root/airgen/workspace/dev/dev-users.json', 'utf8'));

// Remove any existing admin@airgen.local
const filtered = users.filter(u => u.email !== 'admin@airgen.local');
filtered.push(user);

// Write back
fs.writeFileSync('/root/airgen/workspace/dev/dev-users.json', JSON.stringify(filtered, null, 2));
console.log('Created user admin@airgen.local with password admin123 (SHA256)');
console.log('Password hash:', hashedPassword);
