import { describe, expect, it } from "vitest";
import { evidenceIdentity } from "../src/reviewSearch/evidenceIdentity.js";

describe("evidenceIdentity", () => {
  it("treats the same page from different search providers as one evidence source", () => {
    const naver = evidenceIdentity({
      source: "naver_blog",
      title: "A카페",
      snippet: "휠체어 출입 가능",
      link: "https://www.example.com/review/1?utm_source=naver&id=7"
    });
    const daum = evidenceIdentity({
      source: "daum_web",
      title: "A카페 후기",
      snippet: "문턱 없음",
      link: "https://example.com/review/1?id=7&utm_medium=search#section"
    });

    expect(naver).toBe(daum);
  });
});
