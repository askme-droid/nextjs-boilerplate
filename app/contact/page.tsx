export default function ContactPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Contact Us</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Have a question or want to get in touch? Reach us on social media —
        a dedicated contact form is coming soon.
      </p>

      <ul className="flex flex-col gap-2 text-sm">
        <li>
          <a
            href="https://www.facebook.com/FDSGDeals"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-teal hover:underline"
          >
            facebook.com/FDSGDeals
          </a>
        </li>
        <li>
          <a
            href="https://www.instagram.com/fdsgdeals/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-teal hover:underline"
          >
            instagram.com/fdsgdeals
          </a>
        </li>
      </ul>
    </main>
  );
}
