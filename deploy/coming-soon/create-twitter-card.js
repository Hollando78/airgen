const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

async function createTwitterCard() {
  // Twitter card dimensions (1200x630 for summary_large_image)
  const width = 1200;
  const height = 630;
  
  // Create canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Fill background with a gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0a0e27');
  gradient.addColorStop(1, '#1a1e3a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Load and draw logo (centered, scaled appropriately)
  const logo = await loadImage(path.join(__dirname, 'AIRGen_logo.png'));
  
  // Scale logo to fit nicely (about 300px height to leave room)
  const logoHeight = 300;
  const logoWidth = (logo.width / logo.height) * logoHeight;
  const logoX = (width - logoWidth) / 2;
  const logoY = 100;
  
  ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
  
  // Add text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  
  // Main title
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('AIRGen Studio', width / 2, logoY + logoHeight + 80);
  
  // Subtitle
  ctx.font = '28px sans-serif';
  ctx.fillStyle = '#b0b8d4';
  ctx.fillText('AI-Powered Requirements Engineering', width / 2, logoY + logoHeight + 130);
  
  // Coming soon text
  ctx.font = '24px sans-serif';
  ctx.fillStyle = '#7b88b0';
  ctx.fillText('Coming Soon', width / 2, logoY + logoHeight + 170);
  
  // Save the image
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(__dirname, 'twitter-card.png'), buffer);
  
  console.log('Twitter card image created: twitter-card.png');
}

createTwitterCard().catch(console.error);