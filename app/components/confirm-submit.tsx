"use client";

import type { ReactNode } from "react";

/**
 * A submit button that asks "Are you sure?" first (the browser's own
 * confirm box), for actions that can't be undone, such as deleting.
 * Cancelling stops the form from being sent.
 */
export function ConfirmSubmit({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
