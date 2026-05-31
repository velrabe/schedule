-- Rename modafinil → moda; normalize mirrored session_events.

update substances
set name = 'moda'
where lower(name) = 'modafinil';

update session_events
set category = 'moda'
where lower(category) = 'modafinil';

update session_events
set title = regexp_replace(title, 'modafinil', 'moda', 'gi')
where title ilike '%modafinil%';
