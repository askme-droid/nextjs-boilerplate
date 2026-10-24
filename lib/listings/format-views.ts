/** "1 view", "1,234 views". Plain helper, safe in client components. */
export function formatViews(count: number): string {
  return `${count.toLocaleString("en-SG")} view${count === 1 ? "" : "s"}`;
}
