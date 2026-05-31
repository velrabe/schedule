-- Substance doses (substances row) are timeline markers, not parts inside a diary session.

update session_events
set session_id = null
where substance_id is not null
  and session_id is not null;
