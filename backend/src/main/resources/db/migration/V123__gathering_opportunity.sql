ALTER TABLE gatherings ADD COLUMN opportunity_id BIGINT REFERENCES external_opportunities(id) ON DELETE SET NULL;

CREATE INDEX idx_gatherings_opportunity ON gatherings(opportunity_id);
