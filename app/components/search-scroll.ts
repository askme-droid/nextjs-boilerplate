// "Results on top": after a search lands, bring the search card to the top of
// the screen so the first results are the first thing visible (otherwise the
// page sits at the hero, or wherever the shrunken page happens to leave the
// scroll position, with the results below the fold).
//
// A search is started in one place (the form's submit, or the photo button)
// and finishes later, when the URL's params change and the new results have
// rendered. The start side calls requestScrollToResults(); the form component
// consumes the request when the params change. A flag, rather than "scroll on
// every params change", keeps back/forward navigation and pagination alone.

let requested = false;

export function requestScrollToResults() {
  requested = true;
}

export function consumeScrollRequest(): boolean {
  const was = requested;
  requested = false;
  return was;
}

export function scrollToResults() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById("search")
    ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}
