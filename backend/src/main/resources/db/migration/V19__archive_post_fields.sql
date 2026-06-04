ALTER TABLE archive_files
    ADD COLUMN title VARCHAR(200),
    ADD COLUMN description TEXT,
    ADD COLUMN uploader_name VARCHAR(100);

UPDATE archive_files SET title = original_name WHERE title IS NULL;
