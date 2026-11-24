ALTER TABLE site_settings ADD COLUMN recruit_cohort VARCHAR(80) NOT NULL DEFAULT '60기';
ALTER TABLE site_settings ADD COLUMN recruit_fee VARCHAR(80) NOT NULL DEFAULT '2만원';
ALTER TABLE site_settings ADD COLUMN recruit_room VARCHAR(120) NOT NULL DEFAULT '복지관 403호';
ALTER TABLE site_settings ADD COLUMN recruit_headline VARCHAR(120) NOT NULL DEFAULT '지금 60기 상시 모집 중';
