import type { WheelMateDatabase } from "../db.js";

export interface LoaderContext {
  db: WheelMateDatabase;
  rawDir: string;
}

export interface LoaderResult {
  source: string;
  status: "loaded" | "skipped" | "failed";
  loadedCount: number;
  message?: string;
}

export interface PublicDataLoader {
  source: string;
  load(context: LoaderContext): Promise<LoaderResult>;
}
