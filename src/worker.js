import { simulate } from "./engine.js";
import { toCSV } from "./storage.js";
let cancelled = false,
  busy = false;
self.onmessage = async ({ data }) => {
  if (data.type === "cancel") {
    cancelled = true;
    return;
  }
  if (data.type !== "start" || busy) return;
  busy = true;
  cancelled = false;
  try {
    const result = await simulate(data.config, data.history, {
      onProgress: (progress) =>
        self.postMessage({ type: "progress", progress }),
      isCancelled: () => cancelled,
    });
    // Transfer CSV text instead of cloning 100,000 rich candidate objects onto the UI thread.
    const candidateCSV = toCSV(result.accepted);
    const { accepted, ...summary } = result;
    self.postMessage({ type: "done", result: { ...summary, candidateCSV } });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  } finally {
    busy = false;
  }
};
