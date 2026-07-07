# 처음부터 제출까지: GitHub + 컨테이너 이미지 등록

가장 쉬운 제출 흐름은 다음입니다.

```text
내 프로젝트 폴더 -> GitHub 저장소 업로드 -> GitHub Actions가 컨테이너 이미지 생성 -> 등록 화면에 이미지 정보 입력
```

## 1. GitHub 저장소 만들기

1. GitHub에 로그인합니다.
2. 오른쪽 위 `+` 버튼을 누릅니다.
3. `New repository`를 선택합니다.
4. Repository name에 예를 들어 다음을 입력합니다.

```text
seocho-accessibility-mcp
```

5. `Private` 또는 `Public`을 선택합니다.
   - 공모전/제출처가 이미지 접근을 해야 한다면 `Public`이 가장 쉽습니다.
   - 코드는 private로 두고 싶으면 package 권한/토큰 설정이 추가로 필요할 수 있습니다.
6. `Add a README file`은 체크하지 않는 것을 권장합니다. 이미 로컬에 파일이 있습니다.
7. `Create repository`를 누릅니다.

## 2. 로컬 폴더를 GitHub에 업로드

`cmd` 또는 PowerShell에서:

```cmd
cd /d E:\wheel
git init
git branch -M main
git add .
git commit -m "Initial MCP container MVP"
git remote add origin https://github.com/<GitHub사용자명>/seocho-accessibility-mcp.git
git push -u origin main
```

`<GitHub사용자명>`은 본인 GitHub 아이디로 바꿉니다.

예:

```cmd
git remote add origin https://github.com/woouser/seocho-accessibility-mcp.git
```

## 3. GitHub Actions로 컨테이너 이미지 만들기

이 저장소에는 이미 다음 workflow가 들어 있습니다.

```text
.github/workflows/docker-publish.yml
```

GitHub에 push하면 자동으로 이미지가 만들어집니다.

확인 방법:

1. GitHub 저장소 페이지로 갑니다.
2. 위쪽 `Actions` 탭을 누릅니다.
3. `Build and publish MCP container` 실행이 초록 체크가 될 때까지 기다립니다.
4. 저장소 오른쪽 또는 사용자 프로필의 `Packages`에서 이미지가 생성됐는지 확인합니다.

이미지 주소는 보통 다음 형태입니다.

```text
ghcr.io/<GitHub사용자명>/seocho-accessibility-mcp:0.1.0
```

또는:

```text
ghcr.io/<GitHub사용자명>/seocho-accessibility-mcp:latest
```

## 4. 등록 화면에 입력할 값

첨부한 등록 화면 기준:

```text
Registry 호스트: ghcr.io
Registry 사용자: <GitHub사용자명>
Registry 비밀번호: <GitHub Personal Access Token>
image_name: <GitHub사용자명>/seocho-accessibility-mcp
image_tag: 0.1.0
레지스트리 TLS 검증 해제: 체크하지 않음
```

예를 들어 GitHub 아이디가 `woouser`라면:

```text
Registry 호스트: ghcr.io
image_name: woouser/seocho-accessibility-mcp
image_tag: 0.1.0
```

## 5. GitHub 토큰 만들기

등록 화면에서 private image를 가져가야 하거나 인증이 필요한 경우 GitHub PAT가 필요합니다.

1. GitHub 오른쪽 위 프로필 클릭
2. `Settings`
3. 왼쪽 아래 `Developer settings`
4. `Personal access tokens`
5. `Tokens (classic)` 또는 fine-grained token 생성
6. 최소 권한:
   - packages read 권한
   - private repository라면 repository read 권한

토큰은 한 번만 보이므로 안전하게 보관합니다.

## 6. 카카오 API 키

컨테이너 이미지에는 `api_key.env`가 포함되지 않습니다.

실행/등록 환경에서 다음 환경변수를 넣어야 합니다.

```text
KAKAO_REST_API_KEY=<카카오 REST API 키>
```

등록 화면에 환경변수 입력칸이 따로 있으면 거기에 넣습니다.
환경변수 입력칸이 없다면, 등록 플랫폼이 secret/env 설정을 지원하는지 확인해야 합니다.

## 7. 제출 전에 확인할 것

- GitHub Actions가 초록 체크인지
- Package/image가 생성됐는지
- image tag가 `0.1.0` 또는 `latest`인지
- `api_key.env`, `api_key.txt`가 GitHub에 올라가지 않았는지
- 등록 화면에 `ghcr.io`, image name, tag를 정확히 나눠 입력했는지

## 8. 문제 생기면 먼저 볼 곳

- GitHub `Actions` 탭: 이미지 빌드 실패 이유 확인
- GitHub `Packages`: 이미지가 실제로 올라갔는지 확인
- 등록 플랫폼 로그: 이미지를 pull하지 못했는지, API 키가 없는지 확인
