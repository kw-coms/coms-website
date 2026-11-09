-- 운영 요청에 따라 후원자 1건을 익명으로 전환한다.
--
-- 공개 응답은 anonymous = TRUE 인 행을 "익명 후원자"로 줄여 내보낸다(SponsorService.toPublic:
-- id/이름/로고/링크/소개 제거). 저장소가 공개라 이 파일에는 이름을 적지 않고 id 와 since_date 로
-- 행을 특정한다. name 컬럼은 NOT NULL 이고 관리자 탭·CSV 장부가 행을 식별하는 데 쓰므로 지우지
-- 않는다. 이미 anonymous 인 행은 조건에서 빠지므로 재실행해도 아무것도 바뀌지 않는다.
UPDATE sponsors
SET anonymous = TRUE,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND since_date = DATE '2026-09-04'
  AND anonymous = FALSE;
