-- Backfill coordinates for legacy organizations that stored only a known demo place name.
-- Unknown names are intentionally left unchanged because guessing a position would make the
-- customer journey misleading.
UPDATE orgs
SET location_lat = CASE lower(trim(grid_region))
      WHEN 'green acres farm, pa' THEN 40.0379
      WHEN 'demo green valley farm' THEN 40.0379
      WHEN 'earthbound farm, carmel valley, ca' THEN 36.4797
      WHEN 'driscoll''s, watsonville, ca' THEN 36.9102
      WHEN 'salinas produce processing center, ca' THEN 36.6777
      WHEN 'port of oakland distribution hub, ca' THEN 37.7955
      WHEN 'pittsburgh community market, pa' THEN 40.4406
    END,
    location_lng = CASE lower(trim(grid_region))
      WHEN 'green acres farm, pa' THEN -76.3055
      WHEN 'demo green valley farm' THEN -76.3055
      WHEN 'earthbound farm, carmel valley, ca' THEN -121.7328
      WHEN 'driscoll''s, watsonville, ca' THEN -121.7569
      WHEN 'salinas produce processing center, ca' THEN -121.6555
      WHEN 'port of oakland distribution hub, ca' THEN -122.2787
      WHEN 'pittsburgh community market, pa' THEN -79.9959
    END
WHERE (location_lat IS NULL OR location_lng IS NULL OR (location_lat = 0 AND location_lng = 0))
  AND lower(trim(grid_region)) IN (
    'green acres farm, pa',
    'demo green valley farm',
    'earthbound farm, carmel valley, ca',
    'driscoll''s, watsonville, ca',
    'salinas produce processing center, ca',
    'port of oakland distribution hub, ca',
    'pittsburgh community market, pa'
  );

-- Copy an organization's coordinates into its earlier stage snapshots when those snapshots
-- have no usable coordinates. This keeps historical stage rows compatible with the map while
-- preserving the place name that was recorded at the time.
UPDATE stages
SET org_snapshot = json_set(
      CASE WHEN json_valid(org_snapshot) THEN org_snapshot ELSE '{}' END,
      '$.grid_region', coalesce(
        nullif(json_extract(
          CASE WHEN json_valid(org_snapshot) THEN org_snapshot ELSE '{}' END,
          '$.grid_region'
        ), ''),
        (SELECT grid_region FROM orgs WHERE orgs.id = stages.actor_org_id),
        'unspecified'
      ),
      '$.location_lat', (SELECT location_lat FROM orgs WHERE orgs.id = stages.actor_org_id),
      '$.location_lng', (SELECT location_lng FROM orgs WHERE orgs.id = stages.actor_org_id)
    )
WHERE actor_org_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM orgs
    WHERE orgs.id = stages.actor_org_id
      AND location_lat IS NOT NULL
      AND location_lng IS NOT NULL
      AND NOT (location_lat = 0 AND location_lng = 0)
  )
  AND (
    json_type(CASE WHEN json_valid(org_snapshot) THEN org_snapshot ELSE '{}' END, '$.location_lat') IS NULL
    OR json_type(CASE WHEN json_valid(org_snapshot) THEN org_snapshot ELSE '{}' END, '$.location_lng') IS NULL
    OR (
      json_extract(CASE WHEN json_valid(org_snapshot) THEN org_snapshot ELSE '{}' END, '$.location_lat') = 0
      AND json_extract(CASE WHEN json_valid(org_snapshot) THEN org_snapshot ELSE '{}' END, '$.location_lng') = 0
    )
  );

