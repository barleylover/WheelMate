import { describe, expect, it } from "vitest";
import { kakaoMapLink, kakaoRouteLink } from "../src/core/links.js";

describe("kakao links", () => {
  it("place_url 이 있으면 카카오맵 장소 페이지(https)를 사용한다", () => {
    expect(kakaoMapLink("스노우마운틴", "http://place.map.kakao.com/12345")).toBe(
      "https://place.map.kakao.com/12345"
    );
  });

  it("place_url 이 없고 주소도 없으면 이름 검색 링크로 대체한다", () => {
    expect(kakaoMapLink("동네카페")).toBe(
      `https://map.kakao.com/?q=${encodeURIComponent("동네카페")}`
    );
  });

  it("place_url 이 없지만 주소가 있으면 '주소 + 이름' 으로 정확히 검색한다", () => {
    expect(kakaoMapLink("동네카페", undefined, "서울 마포구 양화로 1")).toBe(
      `https://map.kakao.com/?q=${encodeURIComponent("서울 마포구 양화로 1 동네카페")}`
    );
  });

  it("place_url 이 있으면 주소가 있어도 장소 페이지(https)를 우선한다", () => {
    expect(kakaoMapLink("스노우마운틴", "http://place.map.kakao.com/12345", "서울 마포구 양화로 1")).toBe(
      "https://place.map.kakao.com/12345"
    );
  });

  it("길찾기 링크는 출발지→도착지 sName/eName 형식이고, 폐기된 /link/to/ 스킴을 쓰지 않는다", () => {
    const link = kakaoRouteLink("홍대입구역", "스노우마운틴");
    expect(link).toBe(
      `https://map.kakao.com/?sName=${encodeURIComponent("홍대입구역")}&eName=${encodeURIComponent("스노우마운틴")}`
    );
    expect(link).not.toContain("/link/to/");
  });
});
