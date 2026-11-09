-- V106 이 후원자 1건의 anonymous 플래그를 켜서 로그인한 회원에게도 "익명 후원자"로 보였다.
--
-- 이제 비회원(로그아웃 방문자)에 대한 가리기는 공개 API 가 직접 한다(SponsorController /
-- SponsorService.publicList(member)): 비회원에게는 모든 후원자가 익명 자리 표시자로 나가고,
-- 회원에게는 실제 정보가 나간다. 그래서 anonymous 플래그는 다시 "후원자 본인이 모두에게
-- 익명을 원했다"는 뜻으로만 쓴다. V106 이 켠 그 행 하나만 되돌린다. 저장소가 공개라 이름은
-- 적지 않고 id 와 since_date 로 행을 특정한다. 이미 FALSE 인 행은 조건에서 빠지므로 재실행해도
-- 아무것도 바뀌지 않는다.
UPDATE sponsors
SET anonymous = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND since_date = DATE '2026-09-04'
  AND anonymous = TRUE;
