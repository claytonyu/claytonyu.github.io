// Shared UI treatment for API errors that weren't already handled globally in api.js
// (401 → login, 403 canvas_token_required → reconnect banner).
import { ApiError } from "./api.js";
import { reloadData } from "./actions.js";
import { toast, showBanner, hideBanner } from "./notify.js";

// onInline: shows a 400 message on the form that submitted. retry: offered for 502 (Canvas down).
export function handleError(error, { onInline, retry } = {}) {
  if (!(error instanceof ApiError)) throw error; // a real bug: let it reach the console
  if (error.handled) return;

  if (error.status === 404) {
    toast("That item is no longer available. Refreshing your data.");
    reloadData().catch((reloadError) => handleError(reloadError));
  } else if (error.status === 502) {
    showBanner("canvas-down", "Canvas couldn't be reached. Try again in a moment.", {
      kind: "error",
      action: retry && { label: "Retry", onClick: () => { hideBanner("canvas-down"); retry(); } },
    });
  } else if (error.status === 400 && onInline) {
    onInline(error.message);
  } else {
    toast(error.message, "error");
  }
}
