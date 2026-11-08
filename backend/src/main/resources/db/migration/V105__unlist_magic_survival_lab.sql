-- Unlist Magic Survival Lab: the owner asked for it to be removed from both catalogs.
-- Removes only the rows V104 inserted, matched on V104's exact values, so a row an admin has
-- edited since (different link, author) is left alone. Deleting an already-removed row is a no-op.
-- club_project_* child rows go with the project through ON DELETE CASCADE (V54); no other
-- table references club_projects or app_catalog_entries.
DELETE FROM club_projects
WHERE title = 'Magic Survival Lab'
  AND made_by = '최준혁'
  AND link_url = 'https://choijunhuk.github.io/magic-survival-lab/';

DELETE FROM app_catalog_entries
WHERE title = 'Magic Survival Lab'
  AND href = 'https://choijunhuk.github.io/magic-survival-lab/';
