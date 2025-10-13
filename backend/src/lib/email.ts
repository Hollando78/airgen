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
};

let transporter: Transporter | null = null;

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

  if (config.email.systemBcc) {
    mailOptions.bcc = config.email.systemBcc;
  }

  try {
    if (config.email.enabled) {
      // Send via SMTP
      await transport.sendMail(mailOptions);
      logger.info({ to: options.to, bcc: config.email.systemBcc, subject: options.subject }, "Email sent via SMTP");
    } else {
      // Log to console for development
      console.log("\n" + "=".repeat(80));
      console.log("📧 EMAIL (Development Mode - Not Actually Sent)");
      console.log("=".repeat(80));
      console.log(`From: ${mailOptions.from}`);
      console.log(`To: ${mailOptions.to}`);
      if (mailOptions.bcc) {
        console.log(`Bcc: ${mailOptions.bcc}`);
      }
      console.log(`Subject: ${mailOptions.subject}`);
      console.log("-".repeat(80));
      console.log(mailOptions.text);
      console.log("=".repeat(80) + "\n");
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
