-- Food atoms must not carry sport/activity metrics (wrong links from heuristics).

UPDATE session_events
SET
  activity_id = NULL,
  sport_type = NULL,
  calories_burned = NULL,
  distance_km = NULL,
  pace = NULL
WHERE kind = 'food' OR category = 'food';
