-- Прогулка = спорт (sport_walk), не отдельный life-bucket category=walk.
-- Нужно для session_events kind=sport и линковки activities (kcal out).

UPDATE sessions
SET
  category = 'sport_walk',
  type = 'sport'
WHERE category = 'walk' OR type IN ('walk', 'walking');

UPDATE session_events
SET
  category = 'sport_walk',
  kind = CASE
    WHEN kind IN ('wake', 'substance') THEN kind
    ELSE 'sport'
  END,
  sport_type = COALESCE(NULLIF(sport_type, ''), 'walk')
WHERE category = 'walk'
   OR kind IN ('walk', 'walking')
   OR (sport_type = 'walk' AND (category IS NULL OR category NOT LIKE 'sport_%'));
