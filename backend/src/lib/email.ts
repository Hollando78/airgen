import nodemailer, { type Transporter, type SendMailOptions } from "nodemailer";
import { config } from "../config.js";
import { logger } from "./logger.js";

/**
 * Email service with SMTP or console fallback.
 *
 * In production: sends emails via SMTP
 * In development: logs emails to console
 */

type EmailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  bcc?: string | string[];
};

let transporter: Transporter | null = null;
const ADMIN_BCC_RECIPIENT = "info@airgen.studio";

function normalizeRecipients(input: string | string[]): string[] {
  if (Array.isArray(input)) {
    return input.map(recipient => recipient.trim()).filter(Boolean);
  }
  return input.split(",").map(recipient => recipient.trim()).filter(Boolean);
}

/**
 * Initialize email transporter
 */
function getTransporter(): Transporter {
  if (transporter) {
    return transporter;
  }

  if (config.email.enabled) {
    // SMTP configuration
    transporter = nodemailer.createTransport({
      host: config.email.smtpHost,
      port: config.email.smtpPort,
      secure: config.email.smtpSecure,
      auth: {
        user: config.email.smtpUser,
        pass: config.email.smtpPassword
      }
    });
    logger.info("Email service initialized with SMTP");
  } else {
    // Console fallback for development
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true
    });
    logger.info("Email service initialized in console mode (development)");
  }

  return transporter;
}

/**
 * Send an email
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  const transport = getTransporter();

  const mailOptions: SendMailOptions = {
    from: config.email.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || options.html.replace(/<[^>]*>/g, "") // Strip HTML for text version
  };

  const bccRecipients = new Set<string>();

  if (config.email.systemBcc) {
    if (Array.isArray(config.email.systemBcc)) {
      normalizeRecipients(config.email.systemBcc).forEach(recipient => bccRecipients.add(recipient));
    } else {
      normalizeRecipients(config.email.systemBcc).forEach(recipient => bccRecipients.add(recipient));
    }
  }

  if (options.bcc) {
    normalizeRecipients(options.bcc).forEach(recipient => bccRecipients.add(recipient));
  }

  bccRecipients.add(ADMIN_BCC_RECIPIENT);

  if (bccRecipients.size > 0) {
    mailOptions.bcc = Array.from(bccRecipients);
  }

  try {
    if (config.email.enabled) {
      // Send via SMTP
      await transport.sendMail(mailOptions);
      logger.info({ to: options.to, bcc: config.email.systemBcc, subject: options.subject }, "Email sent via SMTP");
    } else {
      // Log to console for development
      logger.info({
        from: mailOptions.from,
        to: mailOptions.to,
        bcc: mailOptions.bcc ? (Array.isArray(mailOptions.bcc) ? mailOptions.bcc.join(", ") : mailOptions.bcc) : undefined,
        subject: mailOptions.subject,
        text: mailOptions.text
      }, "EMAIL (Development Mode - Not Actually Sent)");
      logger.info({ to: options.to, bcc: mailOptions.bcc, subject: options.subject }, "Email logged to console (dev mode)");
    }
  } catch (error) {
    logger.error({ err: error, to: options.to }, "Failed to send email");
    throw new Error("Failed to send email");
  }
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(
  email: string,
  name: string | undefined,
  token: string
): Promise<void> {
  const verificationUrl = `${config.appUrl}/verify-email?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2563eb;">Verify Your Email Address</h2>
      <p>Hello ${name || "there"},</p>
      <p>Thank you for signing up! Please verify your email address by clicking the button below:</p>
      <p style="margin: 30px 0;">
        <a href="${verificationUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Verify Email Address
        </a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="background-color: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all;">
        ${verificationUrl}
      </p>
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        This link will expire in 1 hour. If you didn't create an account, you can safely ignore this email.
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "Verify Your Email Address - AIRGen",
    html
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  name: string | undefined,
  token: string
): Promise<void> {
  const resetUrl = `${config.appUrl}/reset-password?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc2626;">Password Reset Request</h2>
      <p>Hello ${name || "there"},</p>
      <p>We received a request to reset your password. Click the button below to create a new password:</p>
      <p style="margin: 30px 0;">
        <a href="${resetUrl}"
           style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Reset Password
        </a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="background-color: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all;">
        ${resetUrl}
      </p>
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        This link will expire in 30 minutes. If you didn't request a password reset, you can safely ignore this email.
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "Password Reset Request - AIRGen",
    html
  });
}

/**
 * Send password changed notification
 */
export async function sendPasswordChangedEmail(
  email: string,
  name: string | undefined
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #059669;">Password Changed Successfully</h2>
      <p>Hello ${name || "there"},</p>
      <p>This is a confirmation that your password has been changed successfully.</p>
      <p>If you did not make this change, please contact support immediately.</p>
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        For security reasons, all active sessions have been logged out. Please log in again with your new password.
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "Password Changed - AIRGen",
    html
  });
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(
  email: string,
  name: string | undefined
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2563eb;">Welcome to AIRGen 👋</h2>
      <p>Hello ${name || "there"},</p>
      <p>Thanks for creating an AIRGen workspace. You're all set to start capturing requirements, collaborating with your team, and tracking progress.</p>
      <p>Here are a few next steps to explore:</p>
      <ul style="margin: 16px 0 24px 20px;">
        <li>Verify your email so teammates can trust notifications from you</li>
        <li>Invite collaborators from the sidebar once you're ready</li>
        <li>Import an existing spec or start from our templates in <strong>New Document</strong></li>
      </ul>
      <p style="margin: 30px 0;">
        <a href="${config.appUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Open My Workspace
        </a>
      </p>
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        Need a hand? Reply to this email and our team will help you get oriented.
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "Welcome to AIRGen",
    html
  });
}

/**
 * Send confirmation that email was verified
 */
export async function sendEmailVerifiedConfirmation(
  email: string,
  name: string | undefined
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #16a34a;">Email Verified ✅</h2>
      <p>Hello ${name || "there"},</p>
      <p>Your email address is verified—thanks! Team notifications and exports will now show your identity correctly.</p>
      <p>Next up, invite your teammates or explore your workspace to start documenting requirements.</p>
      <p style="margin: 30px 0;">
        <a href="${config.appUrl}"
           style="background-color: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Continue in AIRGen
        </a>
      </p>
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        If you didn't complete this verification, please contact support immediately.
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "You're Verified! – AIRGen",
    html
  });
}

/**
 * Send login alert to user
 */
export async function sendLoginAlertEmail(
  email: string,
  name: string | undefined,
  ip: string,
  mfaEnabled: boolean
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2563eb;">New Login to AIRGen</h2>
      <p>Hello ${name || "there"},</p>
      <p>We noticed a login to your AIRGen account.</p>
      <div style="background-color: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>IP Address:</strong> ${ip || "Unknown"}</p>
        <p style="margin: 5px 0 0 0;"><strong>MFA Required:</strong> ${mfaEnabled ? "Yes" : "No"}</p>
        <p style="margin: 5px 0 0 0;"><strong>Time:</strong> ${new Date().toLocaleString("en-US", { timeZone: "UTC" })} UTC</p>
      </div>
      <p>If this wasn't you, please reset your password and enable 2FA to secure your workspace.</p>
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        You can disable these alerts once you’re comfortable, but we recommend keeping them on while MFA is optional.
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "New Login Detected – AIRGen",
    html
  });
}

/**
 * Notify user when MFA is enabled
 */
export async function sendMfaEnabledEmail(
  email: string,
  name: string | undefined
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0ea5e9;">Two-Factor Authentication Enabled</h2>
      <p>Hello ${name || "there"},</p>
      <p>Great news—2FA is now active on your AIRGen account. Your workspace is safer already.</p>
      <p>Please store your backup codes somewhere secure. You’ll need one if you lose access to your authenticator app.</p>
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        If you didn’t set up 2FA, reset your password immediately and contact support.
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "2FA Enabled – AIRGen",
    html
  });
}

/**
 * Notify user when MFA is disabled
 */
export async function sendMfaDisabledEmail(
  email: string,
  name: string | undefined
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc2626;">2FA Disabled</h2>
      <p>Hello ${name || "there"},</p>
      <p>Two-factor authentication was turned off for your AIRGen account.</p>
      <p>If this was intentional, just be aware that passwords alone are more vulnerable. Consider re-enabling 2FA soon.</p>
      <p>If you did not disable 2FA, reset your password right away and contact support.</p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "2FA Disabled – AIRGen",
    html
  });
}

/**
 * Notify user when a backup code is used
 */
export async function sendMfaBackupCodeUsedEmail(
  email: string,
  name: string | undefined,
  remainingCodes: number
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #f97316;">Backup Code Used</h2>
      <p>Hello ${name || "there"},</p>
      <p>Someone just logged in to AIRGen using a backup code.</p>
      <div style="background-color: #fef3c7; border-left: 4px solid #f97316; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Backup codes remaining:</strong> ${remainingCodes}</p>
      </div>
      <p>If this was you, consider generating new backup codes soon. If not, reset your password and review account activity.</p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "Backup Code Used – AIRGen",
    html
  });
}

/**
 * Notify user about tenant access changes
 */
export async function sendTenantAccessChangedEmail(
  email: string,
  name: string | undefined,
  addedTenants: string[],
  removedTenants: string[]
): Promise<void> {
  if (addedTenants.length === 0 && removedTenants.length === 0) {
    return;
  }

  const changesHtml = [
    addedTenants.length
      ? `<p style="margin: 0;"><strong>Added:</strong> ${addedTenants.join(", ")}</p>`
      : "",
    removedTenants.length
      ? `<p style="margin: 5px 0 0 0;"><strong>Removed:</strong> ${removedTenants.join(", ")}</p>`
      : ""
  ].filter(Boolean).join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2563eb;">Workspace Access Updated</h2>
      <p>Hello ${name || "there"},</p>
      <p>Your AIRGen tenant access changed:</p>
      <div style="background-color: #e0f2fe; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0;">
        ${changesHtml}
      </div>
      <p>If you weren’t expecting this, reach out to your workspace admin or reply to this email.</p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "Workspace Access Updated – AIRGen",
    html
  });
}

/**
 * Notify user about role changes
 */
export async function sendRoleChangedEmail(
  email: string,
  name: string | undefined,
  addedRoles: string[],
  removedRoles: string[]
): Promise<void> {
  if (addedRoles.length === 0 && removedRoles.length === 0) {
    return;
  }

  const changesHtml = [
    addedRoles.length
      ? `<p style="margin: 0;"><strong>Added:</strong> ${addedRoles.join(", ")}</p>`
      : "",
    removedRoles.length
      ? `<p style="margin: 5px 0 0 0;"><strong>Removed:</strong> ${removedRoles.join(", ")}</p>`
      : ""
  ].filter(Boolean).join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #7c3aed;">Role Permissions Updated</h2>
      <p>Hello ${name || "there"},</p>
      <p>Your role permissions in AIRGen have changed:</p>
      <div style="background-color: #ede9fe; border-left: 4px solid #7c3aed; padding: 15px; margin: 20px 0;">
        ${changesHtml}
      </div>
      <p>If this wasn’t expected, please reach out to your admin.</p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "Role Permissions Updated – AIRGen",
    html
  });
}

/**
 * Notify user when an admin-created account is ready
 */
export async function sendAdminCreatedAccountEmail(
  email: string,
  name: string | undefined,
  tenantSlugs: string[],
  roles: string[]
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2563eb;">You've Been Added to AIRGen</h2>
      <p>Hello ${name || "there"},</p>
      <p>An AIRGen admin created an account for you.</p>
      <div style="background-color: #f1f5f9; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0;">
        ${
          tenantSlugs.length
            ? `<p style="margin: 0;"><strong>Workspaces:</strong> ${tenantSlugs.join(", ")}</p>`
            : "<p style=\"margin: 0;\">You'll be able to join a workspace once it’s shared with you.</p>"
        }
        ${
          roles.length
            ? `<p style="margin: 5px 0 0 0;"><strong>Roles:</strong> ${roles.join(", ")}</p>`
            : ""
        }
      </div>
      <p>Sign in with the credentials provided by your admin to get started.</p>
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        If you have any issues accessing AIRGen, reply here and we’ll help.
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "You've Been Invited to AIRGen",
    html
  });
}

/**
 * Send tenant invitation email
 */
export async function sendTenantInvitationEmail(
  email: string,
  tenantSlug: string,
  invitedBy: string | undefined,
  token: string
): Promise<void> {
  const acceptUrl = `${config.appUrl}/invites/accept?token=${encodeURIComponent(token)}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2563eb;">You're invited to ${tenantSlug}</h2>
      <p>${invitedBy || "A teammate"} invited you to collaborate in the AIRGen workspace <strong>${tenantSlug}</strong>.</p>
      <p style="margin: 30px 0;">
        <a href="${acceptUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Accept Invitation
        </a>
      </p>
      <p>If the button doesn't work, paste this link in your browser:</p>
      <p style="background-color: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all;">
        ${acceptUrl}
      </p>
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        If you weren't expecting this invite, you can ignore it.
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: `You're invited to ${tenantSlug} on AIRGen`,
    html
  });
}

/**
 * Send failed signup notification to admin
 */
export async function sendFailedSignupNotification(
  attemptedEmail: string,
  validationErrors: Array<{ field: string; message: string }>,
  ip: string
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #ea580c;">Failed Signup Attempt</h2>
      <p>A user attempted to sign up but failed validation:</p>

      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Email:</strong> ${attemptedEmail}</p>
        <p style="margin: 5px 0 0 0;"><strong>IP Address:</strong> ${ip}</p>
      </div>

      <h3 style="color: #dc2626; margin-top: 30px;">Validation Errors:</h3>
      <ul style="background-color: #fee2e2; padding: 15px 15px 15px 35px; border-radius: 4px; margin: 10px 0;">
        ${validationErrors.map(err => `<li><strong>${err.field}:</strong> ${err.message}</li>`).join('\n        ')}
      </ul>

      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        This is an automated notification to help you track signup conversion issues.
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: "info@airgen.studio",
    subject: `Failed Signup: ${attemptedEmail}`,
    html
  });
}

/**
 * Send successful signup notification to admin
 */
export async function sendSuccessfulSignupNotification(
  email: string,
  name: string | undefined,
  tenantSlug: string,
  ip: string
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #059669;">✅ New User Signup</h2>
      <p>A new user has successfully registered on AIRGen:</p>

      <div style="background-color: #d1fae5; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 5px 0 0 0;"><strong>Name:</strong> ${name || 'Not provided'}</p>
        <p style="margin: 5px 0 0 0;"><strong>Tenant:</strong> ${tenantSlug}</p>
        <p style="margin: 5px 0 0 0;"><strong>IP Address:</strong> ${ip}</p>
        <p style="margin: 5px 0 0 0;"><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC</p>
      </div>

      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        This is an automated notification for early-stage user tracking.
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: "info@airgen.studio",
    subject: `🎉 New Signup: ${email}`,
    html
  });
}

/**
 * Send login notification to admin
 */
export async function sendLoginNotification(
  email: string,
  name: string | undefined,
  ip: string,
  mfaEnabled: boolean
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2563eb;">🔐 User Login</h2>
      <p>A user has logged in to AIRGen:</p>

      <div style="background-color: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 5px 0 0 0;"><strong>Name:</strong> ${name || 'Not provided'}</p>
        <p style="margin: 5px 0 0 0;"><strong>IP Address:</strong> ${ip}</p>
        <p style="margin: 5px 0 0 0;"><strong>MFA Enabled:</strong> ${mfaEnabled ? 'Yes ✓' : 'No'}</p>
        <p style="margin: 5px 0 0 0;"><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC</p>
      </div>

      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
        This is an automated notification for early-stage user tracking.
      </p>
    </body>
    </html>
  `;

  await sendEmail({
    to: "info@airgen.studio",
    subject: `🔐 Login: ${email}`,
    html
  });
}
