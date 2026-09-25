import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { Resend } from "resend";
import { db } from "@/lib/db/client";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // mirrors the Supabase project's current default
    sendResetPassword: async ({ user, url }) => {
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: user.email,
        subject: "Reset your password",
        html: `<p>Click the link below to reset your password:</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
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
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: user.email,
        subject: "Someone tried to sign up with your email",
        html: `<p>Someone just tried to create an account using this email address, which is already registered.</p><p>If this was you, <a href="${process.env.BETTER_AUTH_URL}/login">sign in here</a> instead. If it wasn't you, no action is needed — your account is safe.</p>`,
      });
      if (error) {
        throw new Error(`Failed to send existing-user notice: ${error.message}`);
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: user.email,
        subject: "Confirm your email",
        html: `<p>Click the link below to confirm your email and finish creating your account:</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
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
