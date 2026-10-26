import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { Resend } from "resend";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { renderAuthEmail } from "./email-template";

// Created on first use, not when this file loads: the build imports this file
// without the site's secret settings, and Resend refuses an empty key.
let resendClient: Resend | undefined;
const resend = {
  get emails() {
    resendClient ??= new Resend(process.env.RESEND_API_KEY);
    return resendClient.emails;
  },
};

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // mirrors the Supabase project's current default
    sendResetPassword: async ({ user, url }) => {
      const { html, text } = renderAuthEmail({
        heading: "Reset your password",
        message: "We received a request to reset your password. Click the button below to choose a new one.",
        buttonLabel: "Reset password",
        buttonUrl: url,
        footnote: "If you didn't request this, you can safely ignore this email.",
      });
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: user.email,
        subject: "Reset your password",
        html,
        text,
      });
      if (error) {
        throw new Error(`Failed to send password reset email: ${error.message}`);
      }
    },
    // Fires when someone signs up with an email that's already registered
    // (only while requireEmailVerification is true, which it is here) —
    // Better-Auth's built-in anti-enumeration design: the person at the
    // keyboard gets the same generic "check your email" response either way
    // (confirmed live: the signup response looks identical, no real row is
    // created), while the REAL account owner gets told someone tried. This
    // is a stronger pattern than what the Supabase-based version did (which
    // told the person at the keyboard "this email is already registered").
    onExistingUserSignUp: async ({ user }) => {
      const { html, text } = renderAuthEmail({
        heading: "Someone tried to sign up with your email",
        message: "Someone just tried to create an account using this email address, which is already registered. If this was you, sign in instead using the button below.",
        buttonLabel: "Sign in",
        buttonUrl: `${process.env.BETTER_AUTH_URL}/login`,
        footnote: "If this wasn't you, no action is needed — your account is safe.",
      });
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: user.email,
        subject: "Someone tried to sign up with your email",
        html,
        text,
      });
      if (error) {
        throw new Error(`Failed to send existing-user notice: ${error.message}`);
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { html, text } = renderAuthEmail({
        heading: "Confirm your email",
        message: "Click the button below to confirm your email and finish creating your account.",
        buttonLabel: "Confirm email",
        buttonUrl: url,
        footnote: "If you didn't request this, you can safely ignore this email.",
      });
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: user.email,
        subject: "Confirm your email",
        html,
        text,
      });
      if (error) {
        throw new Error(`Failed to send verification email: ${error.message}`);
      }
    },
  },
  user: {
    additionalFields: {
      // No separate "fullName" field: Better-Auth's own `user.name` already
      // serves that purpose (unlike Supabase's auth.users, which had no name
      // column, hence the old profiles.full_name workaround — carrying that
      // forward here would just be redundant duplication).
      role: {
        type: ["admin", "editor", "viewer"],
        required: false,
        defaultValue: "viewer",
        // Mirrors handle_new_user() never trusting client input for role —
        // a signup request can't set its own role.
        input: false,
      },
    },
  },
  // Required for auth.api.* calls made directly from Server Actions (as
  // opposed to through the /api/auth route handler) to actually set the
  // session cookie — without this plugin, a Server Action calling
  // signInEmail/signUpEmail silently succeeds but never logs the browser in,
  // since Server Actions need the next/headers cookies() API to set cookies
  // and auth.api.* doesn't reach for that on its own. Must be last in the
  // plugins array per Better-Auth's own convention.
  plugins: [nextCookies()],
});
