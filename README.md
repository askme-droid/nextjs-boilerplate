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

In production, both of these need to point at the real domain, not
`localhost`:

- `EMAIL_FROM` must be an address on a domain verified in Resend — e.g.
  `noreply@mail.fd.sg` (a dedicated sending subdomain), not Resend's sandbox
  `onboarding@resend.dev`, which can only deliver to the Resend account
  owner's own address.
- `BETTER_AUTH_URL` must be `https://fd.sg` (or whatever the live domain is),
  so links inside those emails resolve to the real site instead of
  `localhost:3000`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
