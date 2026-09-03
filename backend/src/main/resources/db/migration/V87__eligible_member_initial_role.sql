-- 명부 행이 가입 시 어떤 등급으로 계정을 만들지 정한다.
-- 리크루팅 합격으로 자동 이관된 행은 ASSOCIATE(준회원), 관리자가 직접 넣은 행은 USER(회원).
-- 기존 행은 모두 지금까지의 동작(회원)을 유지한다.
ALTER TABLE eligible_members ADD COLUMN IF NOT EXISTS initial_role VARCHAR(20) NOT NULL DEFAULT 'USER';
