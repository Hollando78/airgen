require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');
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

// Configure Zoho Mail transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.zoho.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.ZOHO_EMAIL,
    pass: process.env.ZOHO_PASSWORD
  }
});

// Verify SMTP connection on startup
transporter.verify(function(error, success) {
  if (error) {
    console.log('SMTP connection error:', error);
    console.log('Email notifications will be disabled.');
  } else {
    console.log('SMTP server is ready to send emails');
  }
});

// Send confirmation email
async function sendConfirmationEmail(userEmail) {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_PASSWORD) {
    console.log('Email credentials not configured, skipping email send');
    return false;
  }

  const mailOptions = {
    from: `"AIRGen Studio" <${process.env.ZOHO_EMAIL}>`,
    to: userEmail,
    subject: 'Welcome to AIRGen Studio - You\'re on the list!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            text-align: center;
            padding: 30px 0;
            background: linear-gradient(135deg, #0a0e27 0%, #1a1e3a 100%);
            border-radius: 10px 10px 0 0;
          }
          .logo {
            max-width: 150px;
            margin-bottom: 20px;
          }
          .content {
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 10px 10px;
          }
          h1 {
            color: #fff;
            margin: 0;
            font-size: 28px;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background: #0066cc;
            color: #fff !important;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Welcome to AIRGen Studio!</h1>
        </div>
        <div class="content">
          <p>Hi there,</p>
          
          <p>Thank you for your interest in AIRGen Studio! You're now on our exclusive early access list.</p>
          
          <p>We're building something truly special - an AI-powered platform that will revolutionize requirements engineering. As one of our early supporters, you'll be the first to know when we launch and will receive:</p>
          
          <ul>
            <li>Early access to the platform</li>
            <li>Special launch pricing</li>
            <li>Exclusive updates on our development progress</li>
          </ul>
          
          <p>Stay connected with us:</p>
          <p style="text-align: center;">
            <a href="https://twitter.com/airgenstudio" class="button">Follow @airgenstudio</a>
          </p>
          
          <p>We can't wait to share what we've been working on!</p>
          
          <p>Best regards,<br>
          The AIRGen Studio Team</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} AIRGen Studio. All rights reserved.</p>
          <p>You're receiving this email because you signed up at <a href="https://airgen.studio">airgen.studio</a></p>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Confirmation email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

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
      
      // Send confirmation email (don't wait for it)
      sendConfirmationEmail(email).catch(console.error);
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
            <p>We've added ${email} to our notification list. Check your inbox for a confirmation email!</p>
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

// Test email endpoint (admin only)
app.post('/api/admin/test-email', async (req, res) => {
  const testEmail = req.body.email || process.env.ZOHO_EMAIL;
  const success = await sendConfirmationEmail(testEmail);
  res.json({ success, email: testEmail });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Notify server with email support running on port ${PORT}`);
  ensureDataFile();
});