const enc = (value: string): string => encodeURIComponent(value);

/**
 * 카카오맵 "위치" 링크.
 * 카카오 Local API 의 place_url(예: http://place.map.kakao.com/{id})이 있으면 그 장소 페이지로,
 * 없으면(구글/OSM 단독 후보 등) 이름 검색으로 대체한다. 예전 map.kakao.com/link/* 스킴은 폐기되어 쓰지 않는다.
 */
export const kakaoMapLink = (name: string, kakaoPlaceUrl?: string): string =>
  kakaoPlaceUrl && kakaoPlaceUrl.length > 0
    ? kakaoPlaceUrl.replace(/^http:\/\//, "https://")
    : `https://map.kakao.com/?q=${enc(name)}`;

/**
 * 카카오맵 "길찾기" 링크. 출발지(사용자 위치)→도착지(추천 매장) 이름 기반 라우팅.
 * 예: https://map.kakao.com/?sName=홍대입구역&eName=스노우마운틴
 */
export const kakaoRouteLink = (originName: string, destinationName: string): string =>
  `https://map.kakao.com/?sName=${enc(originName)}&eName=${enc(destinationName)}`;
