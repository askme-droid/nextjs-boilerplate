This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Email (Resend)

Auth emails (password reset, email verification, existing-user notices) are
sent through Resend (`lib/auth/auth.ts`), using `EMAIL_FROM` as the sender and
`BETTER_AUTH_URL` as the base for every link they contain.

In production these point at the real domain, not `localhost`:

- `EMAIL_FROM` is `FD.SG Directory <hello@directory.fd.sg>` — `directory.fd.sg`
  is a dedicated sending subdomain, verified in Resend (DKIM + SPF; DMARC is
  set on the root `fd.sg` and covers it via DMARC's organizational-domain
  fallback). This is deliberately a different hostname from the live site.
- `BETTER_AUTH_URL` is `https://directories.fd.sg` — the live site's own
  domain, so links inside those emails resolve there instead of
  `localhost:3000`.

Locally, `.env.local` keeps both pointed at `localhost`/Resend's sandbox
sender — it isn't meant to mirror production.

## Deployment

Hosted on Vercel, project `nextjs-boilerplate` under the **FDSG** team
(`vercel.com/fdsg5/nextjs-boilerplate`), connected via Vercel's GitHub
integration to `askme-droid/nextjs-boilerplate`. Every push to `main`
auto-deploys — nothing is deployed through the Vercel CLI.

- **Live domain**: https://directories.fd.sg
- **Production environment variables** (`DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `ANTHROPIC_API_KEY`) are
  set directly in the Vercel dashboard (Project → Settings → Environment
  Variables), not sourced from this repo's `.env.local`.
- **Commit-author gotcha**: Vercel refuses to build a deploy if the pushing
  commit's author email doesn't match a Login Connection on the
  `askme-droid` GitHub account (a 400 on the Git integration, not a build
  failure — it never reaches the build step). This repo's local
  `user.email` is set to that account's GitHub noreply address
  (`331851185+askme-droid@users.noreply.github.com`) specifically to satisfy
  this. Don't change it without confirming Vercel's Login Connections for
  that account first, or deploys will silently stop triggering again.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
