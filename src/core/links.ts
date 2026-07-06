const encodeSegment = (value: string): string => encodeURIComponent(value).replace(/%2F/g, "%252F");

export const kakaoMapLink = (name: string, lat: number, lng: number): string =>
  `https://map.kakao.com/link/map/${encodeSegment(name)},${lat},${lng}`;

export const kakaoRouteLink = (name: string, lat: number, lng: number): string =>
  `https://map.kakao.com/link/to/${encodeSegment(name)},${lat},${lng}`;
