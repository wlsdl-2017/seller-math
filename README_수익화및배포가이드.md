# SELLER MATH — 무자본 배포 및 수익화 운영 매뉴얼

이 문서는 코딩 경험이 없는 운영자도 **초기 비용 0원 · 월 서버 유지비 0원**으로 **SELLER MATH** 정적 웹 서비스를 인터넷에 공개하고, 검색엔진(구글·네이버) 등록 및 광고(구글 애드센스·카카오 애드핏)·제휴 수익화를 진행할 수 있도록 작성한 단계별 매뉴얼입니다.

---

## 1. 왜 GitHub + Cloudflare Pages 구조인가?

- **상업적 광고 허용:** Vercel Hobby(무료) 요금제와 GitHub Pages는 원칙적으로 비상업적(개인·비영리) 용도 제한이 존재합니다. 반면 **Cloudflare Pages(무료 플랜)**는 정적 웹사이트에 무제한 대역폭(Bandwidth)과 무료 HTTPS(SSL)를 제공하면서 **구글 애드센스·카카오 애드핏·제휴 마케팅 등 상업적 광고 게재를 허용**합니다.
- **서버 비용 0원 & 무DB 구조:** 모든 계산은 사용자 브라우저 내부(`common.js`)에서 실행되며, 마지막 입력값과 비교 시나리오만 사용자 기기의 `localStorage`에 저장됩니다. 따라서 별도의 백엔드 서버나 유료 데이터베이스를 유지할 필요가 없습니다.
- **Clean URL 지원:** Cloudflare Pages는 `profit-calculator.html` 파일을 자동으로 `/profit-calculator` 경로로도 연결해 주며, 현재 HTML 내부 링크는 로컬 파일 미리보기와 Cloudflare Pages 환경 모두에서 깨지지 않도록 상대 경로(`profit-calculator.html` 등)로 연결되어 있습니다.

---

## 2. Cloudflare Pages 무료 배포 순서 & 도메인(`canonical`, `sitemap.xml`) 변경 방법

### Step 1. GitHub 저장소 생성 및 파일 업로드
1. [GitHub](https://github.com/)에 무료 가입 후 로그인합니다.
2. 오른쪽 상단 **`+` → `New repository`**를 클릭하고 저장소 이름(예: `seller-math`)을 입력한 뒤 **`Create repository`**를 누릅니다(Public 또는 Private 모두 가능).
3. 생성된 저장소 화면에서 **`uploading an existing file`** 링크를 클릭합니다.
4. 현재 프로젝트 폴더 안의 **9개 서비스 파일 전체**를 마우스로 드래그해 업로드하고 **`Commit changes`** 버튼을 누릅니다.
   - 업로드할 파일: `index.html`, `profit-calculator.html`, `roas-calculator.html`, `selling-price-calculator.html`, `legal.html`, `style.css`, `common.js`, `robots.txt`, `sitemap.xml`
   - (`README_수익화및배포가이드.md`는 운영 매뉴얼이므로 올려도 무방하나, 원치 않으면 제외해도 서비스 동작에는 영향이 없습니다.)

### Step 2. Cloudflare Pages 연결 및 1차 배포
1. [Cloudflare Dashboard](https://dash.cloudflare.com/)에 무료 가입 후 로그인합니다.
2. 왼쪽 메뉴에서 **`Workers & Pages`** → **`Create`** → **`Pages`** 탭 → **`Connect to Git`**을 선택합니다.
3. GitHub 계정을 연동하고 방금 만든 `seller-math` 저장소를 선택합니다.
4. **빌드 설정(Build settings)** 화면에서 아래처럼 비워 둡니다(순수 HTML/CSS/JS 사이트는 빌드 과정이 필요 없습니다).
   - **Framework preset:** `None`
   - **Build command:** *(비워 둠)*
   - **Build output directory:** *(비워 두거나 `/` 입력)*
5. **`Save and Deploy`**를 클릭하면 약 30초~1분 뒤 **`https://seller-math-xxx.pages.dev`** 형태의 실제 무료 도메인이 발급됩니다.

### Step 3. 발급받은 실제 `*.pages.dev` 주소로 URL 일괄 치환하기 (필수!)
현재 파일들에는 예시 도메인인 `https://seller-math.pages.dev`가 들어가 있습니다. 배포 직후 본인이 발급받은 실제 주소(예: `https://my-seller-math.pages.dev`)로 반드시 교체해야 검색엔진이 올바른 대표 URL(Canonical)로 색인합니다.

1. 메모장, VS Code, 또는 GitHub 웹 편집기에서 아래 **7개 파일**을 열어 `https://seller-math.pages.dev` 문자열을 찾아 본인 실제 주소로 바꿉니다. (개인 도메인을 연결한 경우 해당 개인 도메인으로 교체)
   - `index.html`: `<link rel="canonical">`, `<meta property="og:url">`, JSON-LD 내 `"url"`
   - `profit-calculator.html`: `<link rel="canonical">`, `<meta property="og:url">`, JSON-LD 내 `"url"`
   - `roas-calculator.html`: `<link rel="canonical">`, `<meta property="og:url">`, JSON-LD 내 `"url"`
   - `selling-price-calculator.html`: `<link rel="canonical">`, `<meta property="og:url">`, JSON-LD 내 `"url"`
   - `legal.html`: `<link rel="canonical">`, `<meta property="og:url">`
   - `sitemap.xml`: 5개 `<loc>` 태그의 도메인 주소 전체
   - `robots.txt`: `Sitemap:` 뒤의 도메인 주소
2. 수정한 파일을 GitHub 저장소에 다시 업로드(커밋)하면 Cloudflare Pages가 약 30초 안에 자동으로 재배포합니다.

---

## 3. `legal.html` 운영자 연락처 수정 및 애드센스·애드핏 설치 전후 점검

### 1) 운영자 이메일 수정 위치 (배포 전 필수)
- `legal.html` 파일의 **121~127행 부근 (`#operator-contact-email`)**에 예시 이메일이 들어 있습니다.
- 아래 코드의 `sellermath.contact@example.com` 두 곳(링크 주소와 화면 표시 텍스트)을 본인이 실제로 메일을 수신할 수 있는 Gmail/Naver 메일 주소로 수정하세요.
  ```html
  <a id="operator-contact-email" href="mailto:sellermath.contact@example.com">sellermath.contact@example.com</a>
  ```
- 수정 후 아래의 템플릿 안내 문구(`<p class="helper-note">...예시 주소입니다...</p>`)는 삭제해도 됩니다.

### 2) 광고(구글 애드센스 · 카카오 애드핏) 설치 전/후 개인정보처리방침 및 코드 점검
- **광고 설치 전(초기 배포 및 심사 신청 단계):**
  - `legal.html`에는 이미 **"광고 설치 전에는 광고 추적 쿠키를 생성하지 않으며, 설치 후에는 제3자 광고 공급업체(Google AdSense, Kakao AdFit)가 쿠키 및 광고 식별자를 처리할 수 있다"**는 단계별 안내가 반영되어 있습니다.
  - 각 HTML 페이지의 `<aside class="ad-slot ...">` 영역은 광고가 로드될 때 화면이 위아래로 덜컹거리는 **CLS(누적 레이아웃 이동)를 방지하기 위해 최소 높이(`min-height: 100px / 250px`)**가 예약되어 있습니다.
- **광고 승인 및 스크립트 설치 후:**
  1. 발급받은 애드센스 `<script async src="https://pagead2.googlesyndication.com/..."></script>` 코드를 각 페이지 `<head>`에 삽입합니다.
  2. `<aside class="ad-slot ...">` 안의 안내 텍스트(`<span>광고 영역...</span>`)를 지우고 실제 애드센스 `<ins class="adsbygoogle"...>` 또는 애드핏 `<ins class="kakao_ad_area"...>` 태그를 삽입합니다.
  3. 애드센스 관리자에서 요구하는 **`ads.txt`** 파일을 다운로드하거나 한 줄 텍스트를 복사해 프로젝트 루트(`index.html`과 같은 폴더)에 `ads.txt`로 업로드합니다.

---

## 4. 구글 서치콘솔 · 네이버 서치어드바이저 등록 절차

### 1) 구글 서치콘솔 (Google Search Console)
1. [Google Search Console](https://search.google.com/search-console)에 접속해 **`URL 접두어`** 방식으로 실제 도메인(예: `https://seller-math-xxx.pages.dev`)을 입력합니다.
2. 소유권 확인 방법 중 **`HTML 태그`**를 선택해 `<meta name="google-site-verification" content="..." />` 태그를 복사한 뒤 `index.html`의 `<head>` 안쪽에 붙여 넣고 GitHub에 커밋합니다.
3. 재배포 완료 후 서치콘솔에서 **`확인`**을 누릅니다.
4. 왼쪽 메뉴 **`Sitemaps`**로 이동해 `sitemap.xml`을 입력하고 **`제출`**합니다.
5. 상단 **`URL 검사`** 창에 아래 5개 경로를 하나씩 입력해 **`색인 생성 요청`**을 진행합니다.
   - `/`
   - `/profit-calculator`
   - `/roas-calculator`
   - `/selling-price-calculator`
   - `/legal`

### 2) 네이버 서치어드바이저 (Naver Search Advisor)
1. [네이버 서치어드바이저](https://searchadvisor.naver.com/) 로그인 후 **`웹마스터 도구`** → 사이트 URL 등록을 진행합니다.
2. **`HTML 태그`** 인증 방식을 선택해 `<meta name="naver-site-verification" content="..." />` 태그를 `index.html`의 `<head>`에 추가하고 재배포 후 소유 확인을 완료합니다.
3. **`요청` → `사이트맵 제출`** 메뉴에 `https://본인도메인/sitemap.xml`을 제출하고, **`웹 페이지 수집`** 메뉴에서 5개 페이지 URL을 각각 수집 요청합니다.
4. **`검증` → `robots.txt`** 메뉴에서 `robots.txt`가 정상 수집되는지 확인합니다.

---

## 5. 공정위 지침 준수 홍보 가이드 및 수익 발생 시 세무 체크리스트

### 1) 공정거래위원회 표시·광고 지침 준수 홍보 가이드
- **제휴 마케팅(쿠팡 파트너스, 전자책/툴 제휴 등) 이용 시:** 공정위 「추천·보증 등에 관한 표시·광고 심사지침」에 따라, 이용자가 제휴 링크를 클릭하기 전에 경제적 이해관계가 있음을 명확히 알 수 있도록 링크 주변에 **"이 링크를 통해 구매가 이루어지면 일정액의 수수료를 제공받습니다."**와 같은 문구를 반드시 표기해야 합니다.
- **과장·허위 홍보 금지:**
  - 본 서비스에 존재하지 않는 이용자 수, 가짜 평점/후기, "구글 검색 FAQ 리치 결과 보장", "완벽한 CSV 보안 방어" 같은 과장 표현을 홍보 문구로 사용하지 마세요.
  - CSV 내보내기 보안 설명 시에는 **"알려진 CSV Injection 위험을 줄이는 방어 처리가 적용되었다"**고 정확하게 안내하세요.

### 2) 광고·제휴 수익 발생 시 대학생/개인 운영자 세무 체크리스트
- [ ] **사업자 등록 필요성 확인:** 일회성이 아니라 지속적으로 애드센스·애드핏 광고 수익이 발생하기 시작하면, 관할 세무서 또는 홈택스에서 **계속·반복적 영리 활동(사업자 등록 대상)**에 해당하는지 확인하세요. (미디어 콘텐츠 창작업 / 1인 미디어 콘텐츠 창작자 등 업종 코드 확인)
- [ ] **구글 애드센스 외화 수익 부가세(영세율) 검토:** 일반과세자로 사업자 등록을 한 경우, 해외(Google Asia Pacific 등)로부터 외화를 수령하는 광고 수익은 요건 충족 시 **부가가치세 영세율(0%)** 적용 대상이 될 수 있으므로 외화입금증명서 등 증빙을 보관해야 합니다.
- [ ] **국내 광고(카카오 애드핏) 및 제휴 수익:** 국내 플랫폼 수익은 사업자 등록 유무에 따라 세금계산서 발행 또는 사업소득 원천징수(3.3%)로 처리될 수 있으며, 지급명세서 내역을 홈택스에서 확인하세요.
- [ ] **종합소득세 신고 (매년 5월):** 타 근로·사업·기타소득과 합산해 매년 5월 종합소득세 신고 대상 여부를 점검하세요.
- [ ] **세무·건강보험 피부양자 영향 확인:** 연간 일정 금액 이상의 사업소득이 발생하면 부모님 직장건강보험 피부양자 자격이나 장학금·학자금 지원 구간에 영향을 줄 수 있으므로, 본격적인 수익화 시점에 반드시 세무서 국세상담센터(126) 또는 세무사 상담을 받으세요.

---

## 6. 출시 전 교차 검산(QA) 결과 요약표, 알려진 한계 및 배포 후 최종 점검 체크리스트

### 1) 자동 실행 검증 결과 요약 (`common.js` 회계 엔진 및 정적 파일 무결성)
아래 8개 검증 항목과 구문·DOM ID 교차 검사는 프로젝트 내 실제 배포 파일(`common.js`, 5개 HTML, `sitemap.xml`, `robots.txt`)을 대상으로 Node.js 런타임(`ELECTRON_RUN_AS_NODE=1`)에서 직접 실행해 모두 통과(`PASS`)했음을 확인했습니다.

| 검증 번호 | 검증 항목 | 검증 내용 및 확인 결과 | 상태 |
| :--- | :--- | :--- | :--- |
| QA-01 | 표준 기준값 교차 일치 검증 (30,000원 사례) | 정산예정액 `27,000원`, 공헌이익 `14,000원`(순이익·ROAS 계산기 100% 일치), 영업이익 `8,000원`, 마진율 `26.67%`, ROI `80.00%`, 최대 CPA `14,000원`, 손익분기 ROAS `214.29%`, 역산 판매가 `30,000원` 및 역검증 통과 | PASS |
| QA-02 | 33,000원 VAT 분리 케이스 스터디 검증 | 현금 기준(`정산 29,700원`, `C 15,400원`, `이익 12,100원`), 공급가액 손익 기준(`C 14,000원`, `이익 11,000원`, `예상 부가세 1,100원`), 원가 불공제 시(`이익 10,000원`, `부가세 2,100원`) 일치 | PASS |
| QA-03 | 쿠폰 부담 주체별 역산 Round-Trip 검증 | 판매자 부담 10% 쿠폰(`33,333원`), 플랫폼 보전 10% 쿠폰(`30,000원` / 실결제가 수수료 시 `29,670원`), 플랫폼 미보전 10% 쿠폰(`33,333원`) 역산 및 역검증 통과 | PASS |
| QA-04 | 수수료 부과 기준 4종 & 복합 VAT 역산 검증 | 귀속 매출 비례, 실결제가 비례, 배송비 포함 비례, 직접 입력(고정/비례) 4종 모두 목표 마진율 20% 역산 및 Round-Trip 오차 `1e-4` 이내 통과 | PASS |
| QA-05 | 경계값 및 예외 방어 검증 | 원가 0원(`산출 불가 (원가 0원)`), 매출 0원(`산출 불가 (매출 0원)`), 공헌이익 `-4,000원` 시 ROAS 계산 차단 및 경고 문구 출력, 분모 0 이하 역산 차단, 간이과세 부가가치율 미선택 시 계산 보류 확인 | PASS |
| QA-06 | CSV Injection 방어 및 RFC 4180 이스케이프 | UTF-8 BOM(`\uFEFF`) 포함, `=CMD()`, `  +1+1`, `\t-2+3`, `\n@SUM(A1)` 선행 `'` 처리 및 쉼표·큰따옴표 이스케이프, 숫자 `-4000` 원형 유지 확인 | PASS |
| QA-07 | HTML·SEO·XSS·스토리지 방어 무결성 검사 | 5개 HTML 고유 메타·Canonical·JSON-LD(`price: 0`, 가짜 별점 없음), `innerHTML` 미사용, 내부 링크 및 스크립트 존재, `localStorage` 차단 시 예외 미발생, `sitemap.xml` 5개 URL 일치 확인 | PASS |
| QA-08 | 추가 복합 조건·인라인 JS·DOM ID 검사 | 공급가액 입력 역산, 0원/0% 손익분기 역산, 할인율 100% 차단, 면세사업자 부가세 0원, 4개 페이지 인라인 `<script>` 구문 정상 및 HTML `id` 누락 0건 확인 | PASS |

### 2) 미수행 항목 및 알려진 한계 (정직한 QA 보고)
- **실제 브라우저 UI·모바일 기기 렌더링 테스트 미수행:** 위 자동 검사는 Node.js 환경에서 회계 엔진, CSV 생성, HTML 구문 및 DOM ID 매핑을 검증한 것이며, 실제 iOS Safari / Android Chrome 화면에서 사용자가 버튼을 터치하고 차트·테이블 스크롤·인쇄 미리보기를 수행하는 E2E 브라우저 테스트는 아직 수행하지 않았습니다.
- **실제 스프레드시트 프로그램 열기 테스트 미수행:** 생성된 `.csv` 문자열의 BOM 및 이스케이프 규칙은 코드 레벨에서 검증했으나, 실제 Microsoft Excel 및 Google Sheets에서 파일을 열어 깨짐이나 수식 실행 여부를 확인하는 수동 테스트는 사용자가 배포 후 직접 확인해야 합니다.
- **세무·정산 한계:** 마켓별 결제수단 수수료 차등, 카드발행세액공제, 의제매입세액공제, 반품/교환 자동 차감 및 월 고정 인건비/임대료는 건당 계산기 수식에 포함되어 있지 않습니다.
- **실제 광고 코드 미삽입:** 애드센스·애드핏 승인 전 상태이므로 광고 슬롯에는 높이 예약용 자리표시자만 들어 있습니다.

### 3) 배포 후 사용자가 직접 수행할 최종 점검 체크리스트
- [ ] **도메인 치환 확인:** 모든 HTML의 `canonical` / `og:url` / JSON-LD `url` 및 `sitemap.xml`, `robots.txt`가 실제 발급된 Cloudflare Pages 주소로 변경되었는가?
- [ ] **운영자 이메일 교체:** `legal.html` 내 `sellermath.contact@example.com`을 본인 실제 이메일로 변경했는가?
- [ ] **모바일 Safari / Chrome 실기기 점검:** 스마트폰에서 5개 페이지를 모두 열어 상단 네비게이션 줄바꿈, 입력창 확대(줌) 현상 없음, 가로 스크롤 테이블 동작, `localStorage` 페이지 간 값 유지 여부를 확인했는가?
- [ ] **CSV 실제 열기 점검:** 계산기에서 시나리오를 저장(예: 상품명 `=1+1`, `테스트 "상품", 1번` 포함)한 뒤 CSV로 내려받아 **Microsoft Excel 및 Google Sheets**에서 한글 깨짐 없이 열리고 수식으로 실행되지 않는지 확인했는가?
- [ ] **Clean URL 접속 확인:** 배포된 사이트에서 `/profit-calculator`, `/roas-calculator`, `/selling-price-calculator`, `/legal`, `/sitemap.xml`, `/robots.txt` 주소가 모두 404 오류 없이 열리는지 확인했는가?
- [ ] **검색엔진 등록:** 구글 서치콘솔 및 네이버 서치어드바이저에 소유권 인증과 `sitemap.xml` 제출을 마쳤는가?
