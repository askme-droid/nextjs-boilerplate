import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to common questions about finding deals and submitting your own listing on FDSG.",
};

const faqs = [
  {
    question: "How do I find deals near me?",
    answer:
      "Use the search bar and category filter on the homepage to browse listings from local businesses.",
  },
  {
    question: "How do I submit my own listing?",
    answer:
      "Register for an account, then head to My listings to create a draft and submit it for review.",
  },
  {
    question: "Who do I contact for help?",
    answer: "Reach out via the Contact Us page and we'll get back to you.",
  },
];

export default function FaqPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Frequently Asked Questions
      </h1>

      <div className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {faqs.map((faq) => (
          <div key={faq.question} className="flex flex-col gap-1 py-4">
            <h2 className="font-medium">{faq.question}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {faq.answer}
            </p>
          </div>
        ))}
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        More questions coming soon — check back shortly.
      </p>
    </main>
  );
}
