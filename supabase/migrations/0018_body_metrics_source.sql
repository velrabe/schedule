-- body_metrics: distinguish formula estimates vs verified scale/device readings

alter table body_metrics
  add column if not exists source_type text not null default 'estimated';

comment on column body_metrics.source_type is
  'estimated = derived from weight/formula; measured = gym scale etc.; device = dedicated body-composition device';

alter table body_metrics
  drop constraint if exists body_metrics_source_type_check;

alter table body_metrics
  add constraint body_metrics_source_type_check
  check (source_type in ('estimated', 'measured', 'device'));

create index if not exists body_metrics_metric_date_idx
  on body_metrics (metric, date);
