const enc = (value: string): string => encodeURIComponent(value);

/**
 * 카카오맵 "위치" 링크.
 * 1) 카카오 Local API 의 place_url(예: http://place.map.kakao.com/{id})이 있으면 그 장소 페이지로 연결한다(가장 정확).
 * 2) place_url 이 없으면 이름만으로는 동명 장소가 많아 부정확하므로, 주소가 있으면 "주소 + 이름"으로 검색한다.
 * 3) 주소도 없을 때만 이름 검색으로 대체한다. 예전 map.kakao.com/link/* 스킴은 폐기되어 쓰지 않는다.
 */
export const kakaoMapLink = (name: string, kakaoPlaceUrl?: string, address?: string): string => {
  if (kakaoPlaceUrl && kakaoPlaceUrl.length > 0) {
    return kakaoPlaceUrl.replace(/^http:\/\//, "https://");
  }
  const query = address && address.length > 0 ? `${address} ${name}` : name;
  return `https://map.kakao.com/?q=${enc(query)}`;
};

/**
 * 카카오맵 "길찾기" 링크. 출발지(사용자 위치)→도착지(추천 매장) 이름 기반 라우팅.
 * 예: https://map.kakao.com/?sName=홍대입구역&eName=스노우마운틴
 */
export const kakaoRouteLink = (originName: string, destinationName: string): string =>
  `https://map.kakao.com/?sName=${enc(originName)}&eName=${enc(destinationName)}`;
