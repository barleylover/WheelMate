import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { PublicDataClient } from "../src/clients/publicDataClient.js";
import type { AppConfig } from "../src/config.js";
import { applySchema } from "../src/data/db.js";

let tempDir: string;
let dbPath: string;

function testConfig(): AppConfig {
  return {
    useNaverSearch: true,
    useDaumSearch: true,
    useReviewSearch: true,
    useNaverBlog: true,
    useNaverCafe: true,
    useNaverWeb: true,
    useDaumBlog: true,
    useDaumCafe: true,
    useDaumWeb: true,
    defaultRadiusM: 800,
    defaultLimit: 5,
    maxPlaceCandidates: 5,
    maxReviewSearchCalls: 60,
    searchResultsPerQuery: 3,
    searchTimeoutMs: 3500,
    dbPath
  };
}

describe("PublicDataClient", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheelmate-public-data-"));
    dbPath = path.join(tempDir, "accessibility.db");
    const db = new DatabaseSync(dbPath);
    try {
      applySchema(db);
      db.prepare(
        `INSERT INTO public_accessibility_evidence
          (name, address, lat, lng, source, source_family, evidence_level, evidence_type, value, detail, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "A카페",
        "서울 동작구 사당로 1",
        37.481,
        126.981,
        "한국장애인고용공단 BF 인증",
        "bf_certification",
        "building_or_facility_level",
        "bf_certified",
        "본인증",
        "BF 인증 시설로 확인되었습니다.",
        0.9
      );
    } finally {
      db.close();
    }
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("matches building-level public accessibility evidence to a nearby place", () => {
    const client = new PublicDataClient(testConfig());
    const evidence = client.findMatchingAccessibilityEvidence(
      {
        name: "A카페",
        category: "cafe",
        address: "서울 동작구 사당로 1",
        lat: 37.4811,
        lng: 126.9811
      },
      80
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      source_family: "bf_certification",
      evidence_type: "bf_certified",
      level: "building_or_facility_level"
    });
  });
});
