"use client";

import { useState } from "react";
import { isExpired, singaporeDatePlusDays } from "@/lib/listings/expiry-dates";

const PRESETS = [
  { label: "+30 days", days: 30 },
  { label: "+90 days", days: 90 },
  { label: "+1 year", days: 365 },
];

/**
 * ACADP-style expiry choice: "Never expires" or "Expires on <date>", with
 * quick presets. Submits a single `expires_at` field: a YYYY-MM-DD date, or
 * empty for never. The date input stays in the form (just greyed out under
 * "Never") so tools that fill it by name — the flyer reader — still work;
 * typing or filling a date switches to "Expires on" automatically.
 */
export function ExpiryField({
  defaultValue,
  inputClass,
  labelClass,
}: {
  defaultValue: string;
  inputClass: string;
  labelClass: string;
}) {
  const [date, setDate] = useState(defaultValue);
  const [never, setNever] = useState(!defaultValue);
  const value = never ? "" : date;
  const expired = !never && isExpired(date);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={labelClass}>Expiry</legend>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="expiry_mode" checked={never} onChange={() => setNever(true)} />
          Never expires
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="expiry_mode" checked={!never} onChange={() => setNever(false)} />
          Expires on
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          name="expires_at"
          value={value}
          onChange={(e) => {
            setDate(e.target.value);
            setNever(e.target.value === "");
          }}
          onFocus={() => setNever(false)}
          aria-label="Expiry date"
          className={`${inputClass} !mt-0 w-auto ${never ? "opacity-40" : ""}`}
        />
        {PRESETS.map((preset) => (
          <button
            key={preset.days}
            type="button"
            onClick={() => {
              setDate(singaporeDatePlusDays(preset.days));
              setNever(false);
            }}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <p
        className={`text-xs ${expired ? "text-amber-700 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"}`}
      >
        {never
          ? "Stays on the site until you unpublish it."
          : expired
            ? "This date has passed — the listing is hidden from the site. Pick a later date or Never expires to show it again."
            : "Shown through the end of this day (Singapore time), then hidden from the site automatically."}
      </p>
    </fieldset>
  );
}
