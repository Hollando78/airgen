# Zoho Mail Setup for AIRGen Transactional Emails

## Steps to Enable Email Notifications:

### 1. Generate App-Specific Password in Zoho
1. Log into your Zoho Mail account at https://mail.zoho.com
2. Go to Settings → Security → App Passwords
3. Click "Generate New Password"
4. Enter a name like "AIRGen Notify Server"
5. Copy the generated password

### 2. Update Environment Configuration
Edit the `.env` file and replace `your_app_specific_password_here` with your actual password:
```
ZOHO_PASSWORD=paste_your_app_password_here
```

### 3. Restart the Server
```bash
# Stop the current server
pkill -f notify-server

# Start the email-enabled server
PORT=3003 node notify-server-email.js &
```

### 4. Test Email Sending
Test that emails are working:
```bash
curl -X POST https://airgen.studio/api/admin/test-email \
  -H "Content-Type: application/json" \
  -d '{"email":"your-test-email@example.com"}'
```

## SMTP Settings Used:
- **Host**: smtp.zoho.com
- **Port**: 465 (SSL)
- **From**: info@airgenstudio.com

## Features:
- Sends confirmation email when users sign up
- Beautiful HTML email template
- Tracks all submissions in `email-submissions.json`
- Prevents duplicate signups

## Troubleshooting:
- If emails aren't sending, check the server logs
- Verify the app-specific password is correct
- Ensure 2FA is enabled on your Zoho account (required for app passwords)
- Check that outbound port 465 is not blocked