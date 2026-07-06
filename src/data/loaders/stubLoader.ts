import type { PublicDataLoader } from "./types.js";

export const createStubLoader = (source: string): PublicDataLoader => ({
  source,
  async load() {
    return {
      source,
      status: "skipped",
      loadedCount: 0,
      message: "MVP skeleton only. Add public-data endpoint or raw file mapping in a later iteration."
    };
  }
});
