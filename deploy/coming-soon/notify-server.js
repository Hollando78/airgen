const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS headers for form submissions
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://airgen.studio');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Data file path
const DATA_FILE = path.join(__dirname, 'email-submissions.json');

// Ensure data file exists
async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ submissions: [] }, null, 2));
  }
}

// Handle form submission
app.post('/api/notify', async function(req, res) {
  const email = req.body.email;
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    await ensureDataFile();
    
    // Read existing data
    const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    
    // Check if email already exists
    const exists = data.submissions.some(sub => sub.email === email);
    
    if (!exists) {
      // Add new submission
      data.submissions.push({
        email: email,
        timestamp: new Date().toISOString(),
        ip: req.headers['x-forwarded-for'] || req.ip
      });
      
      // Save data
      await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
      console.log(`New email submission: ${email}`);
    }
    
    // Return success HTML response for form submission
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Thank You - AIRGen</title>
        <link rel="stylesheet" href="/styles.css">
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;700&display=swap" rel="stylesheet">
      </head>
      <body>
        <main class="page">
          <div class="card">
            <img src="/AIRGen_logo.png" class="logo" alt="AIRGen logo">
            <h1>Thank you!</h1>
            <p>We've added ${email} to our notification list. You'll be the first to know when AIRGen Studio launches!</p>
            <a href="/" style="color: #0066cc; text-decoration: none; margin-top: 20px; display: inline-block;">← Back to home</a>
          </div>
        </main>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error saving email:', error);
    res.status(500).json({ error: 'Failed to save email' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get submission count (admin endpoint)
app.get('/api/admin/count', async (req, res) => {
  try {
    await ensureDataFile();
    const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    res.json({ count: data.submissions.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get count' });
  }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Notify server running on port ${PORT}`);
  ensureDataFile();
});