CREATE TABLE IF NOT EXISTS attendance_code_lock (id SMALLINT PRIMARY KEY);
MERGE INTO attendance_code_lock (id) KEY (id) VALUES (1);
