-- Import lafkigafk body-composition scale (device readings)

insert into days (date)
select v.d::date from (values
  ('2026-04-10'),
  ('2026-04-11'),
  ('2026-04-12'),
  ('2026-04-13'),
  ('2026-04-14'),
  ('2026-04-15'),
  ('2026-04-16'),
  ('2026-04-17'),
  ('2026-04-18'),
  ('2026-04-19'),
  ('2026-04-20'),
  ('2026-04-21'),
  ('2026-04-22'),
  ('2026-04-23'),
  ('2026-04-24'),
  ('2026-04-25'),
  ('2026-04-27'),
  ('2026-04-28'),
  ('2026-04-29'),
  ('2026-04-30'),
  ('2026-05-01'),
  ('2026-05-02'),
  ('2026-05-03'),
  ('2026-05-04'),
  ('2026-05-05'),
  ('2026-05-06'),
  ('2026-05-07'),
  ('2026-05-08'),
  ('2026-05-09'),
  ('2026-05-12'),
  ('2026-05-13'),
  ('2026-05-15'),
  ('2026-05-16'),
  ('2026-05-19'),
  ('2026-05-21'),
  ('2026-05-24'),
  ('2026-05-25'),
  ('2026-05-26'),
  ('2026-05-27'),
  ('2026-05-29'),
  ('2026-05-30')
) as v(d) on conflict (date) do nothing;

update days set weight_kg = 89.9 where date = '2026-04-10';
update days set weight_kg = 87.35 where date = '2026-04-11';
update days set weight_kg = 88.25 where date = '2026-04-12';
update days set weight_kg = 84.55 where date = '2026-04-13';
update days set weight_kg = 87.6 where date = '2026-04-14';
update days set weight_kg = 86.2 where date = '2026-04-15';
update days set weight_kg = 85.85 where date = '2026-04-16';
update days set weight_kg = 84.95 where date = '2026-04-17';
update days set weight_kg = 86.15 where date = '2026-04-18';
update days set weight_kg = 84.7 where date = '2026-04-19';
update days set weight_kg = 85.65 where date = '2026-04-20';
update days set weight_kg = 85.85 where date = '2026-04-21';
update days set weight_kg = 85.5 where date = '2026-04-22';
update days set weight_kg = 85.45 where date = '2026-04-23';
update days set weight_kg = 84.35 where date = '2026-04-24';
update days set weight_kg = 83.85 where date = '2026-04-25';
update days set weight_kg = 85.65 where date = '2026-04-27';
update days set weight_kg = 85.2 where date = '2026-04-28';
update days set weight_kg = 85.5 where date = '2026-04-29';
update days set weight_kg = 84.2 where date = '2026-04-30';
update days set weight_kg = 83.8 where date = '2026-05-01';
update days set weight_kg = 83.1 where date = '2026-05-02';
update days set weight_kg = 82.85 where date = '2026-05-03';
update days set weight_kg = 81.05 where date = '2026-05-04';
update days set weight_kg = 82.15 where date = '2026-05-05';
update days set weight_kg = 83.5 where date = '2026-05-06';
update days set weight_kg = 83.15 where date = '2026-05-07';
update days set weight_kg = 82.05 where date = '2026-05-08';
update days set weight_kg = 81.05 where date = '2026-05-09';
update days set weight_kg = 82.25 where date = '2026-05-12';
update days set weight_kg = 80.95 where date = '2026-05-13';
update days set weight_kg = 81.75 where date = '2026-05-15';
update days set weight_kg = 82.7 where date = '2026-05-16';
update days set weight_kg = 80.85 where date = '2026-05-19';
update days set weight_kg = 79.65 where date = '2026-05-21';
update days set weight_kg = 82.1 where date = '2026-05-24';
update days set weight_kg = 80.7 where date = '2026-05-25';
update days set weight_kg = 80.65 where date = '2026-05-26';
update days set weight_kg = 80.05 where date = '2026-05-27';
update days set weight_kg = 81.5 where date = '2026-05-29';
update days set weight_kg = 81.25 where date = '2026-05-30';

insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-10', '22:12:00', 'weight_kg', 88.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-10', '22:12:00', 'bf_pct', 26.1, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-10', '22:12:00', 'fat_mass_kg', 23, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-10', '22:12:00', 'muscle_mass_kg', 61.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-10', '23:36:00', 'weight_kg', 89.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-10', '23:36:00', 'bf_pct', 26.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-10', '23:36:00', 'fat_mass_kg', 24, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-10', '23:36:00', 'muscle_mass_kg', 62.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-11', '04:36:00', 'weight_kg', 89.05, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-11', '04:36:00', 'bf_pct', 26.4, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-11', '04:36:00', 'fat_mass_kg', 23.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-11', '04:36:00', 'muscle_mass_kg', 62.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-11', '15:22:00', 'weight_kg', 87.35, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-11', '15:22:00', 'bf_pct', 25.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-11', '15:22:00', 'fat_mass_kg', 22.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-11', '15:22:00', 'muscle_mass_kg', 61.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-12', '01:10:00', 'weight_kg', 87.75, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-12', '01:10:00', 'bf_pct', 25.9, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-12', '01:10:00', 'fat_mass_kg', 22.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-12', '01:10:00', 'muscle_mass_kg', 61.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-12', '12:36:00', 'weight_kg', 88.25, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-12', '12:36:00', 'bf_pct', 26.1, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-12', '12:36:00', 'fat_mass_kg', 23, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-12', '12:36:00', 'muscle_mass_kg', 61.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-13', '18:11:00', 'weight_kg', 84.55, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-13', '18:11:00', 'bf_pct', 24.5, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-13', '18:11:00', 'fat_mass_kg', 20.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-13', '18:11:00', 'muscle_mass_kg', 60.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-14', '17:32:00', 'weight_kg', 86.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-14', '17:32:00', 'bf_pct', 25.4, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-14', '17:32:00', 'fat_mass_kg', 21.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-14', '17:32:00', 'muscle_mass_kg', 61.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-14', '23:14:00', 'weight_kg', 87.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-14', '23:14:00', 'bf_pct', 25.8, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-14', '23:14:00', 'fat_mass_kg', 22.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-14', '23:14:00', 'muscle_mass_kg', 61.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-15', '12:28:00', 'weight_kg', 86.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-15', '12:28:00', 'bf_pct', 25.2, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-15', '12:28:00', 'fat_mass_kg', 21.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-15', '12:28:00', 'muscle_mass_kg', 61.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-16', '01:23:00', 'weight_kg', 85.65, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-16', '01:23:00', 'bf_pct', 25, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-16', '01:23:00', 'fat_mass_kg', 21.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-16', '01:23:00', 'muscle_mass_kg', 60.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-16', '10:22:00', 'weight_kg', 85.85, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-16', '10:22:00', 'bf_pct', 25.1, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-16', '10:22:00', 'fat_mass_kg', 21.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-16', '10:22:00', 'muscle_mass_kg', 61, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-17', '16:32:00', 'weight_kg', 84.95, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-17', '16:32:00', 'bf_pct', 24.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-17', '16:32:00', 'fat_mass_kg', 21, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-17', '16:32:00', 'muscle_mass_kg', 60.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-18', '23:22:00', 'weight_kg', 86.15, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-18', '23:22:00', 'bf_pct', 25.2, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-18', '23:22:00', 'fat_mass_kg', 21.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-18', '23:22:00', 'muscle_mass_kg', 61.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-19', '16:14:00', 'weight_kg', 84.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-19', '16:14:00', 'bf_pct', 24.6, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-19', '16:14:00', 'fat_mass_kg', 20.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-19', '16:14:00', 'muscle_mass_kg', 60.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-20', '11:32:00', 'weight_kg', 85.65, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-20', '11:32:00', 'bf_pct', 25, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-20', '11:32:00', 'fat_mass_kg', 21.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-20', '11:32:00', 'muscle_mass_kg', 60.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-21', '10:24:00', 'weight_kg', 86.95, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-21', '10:24:00', 'bf_pct', 25.5, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-21', '10:24:00', 'fat_mass_kg', 22.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-21', '10:24:00', 'muscle_mass_kg', 61.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-21', '19:50:00', 'weight_kg', 84.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-21', '19:50:00', 'bf_pct', 24.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-21', '19:50:00', 'fat_mass_kg', 20.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-21', '19:50:00', 'muscle_mass_kg', 60.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-21', '22:24:00', 'weight_kg', 85.85, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-21', '22:24:00', 'bf_pct', 25.1, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-21', '22:24:00', 'fat_mass_kg', 21.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-21', '22:24:00', 'muscle_mass_kg', 61, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-22', '00:10:00', 'weight_kg', 85.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-22', '00:10:00', 'bf_pct', 24.9, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-22', '00:10:00', 'fat_mass_kg', 21.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-22', '00:10:00', 'muscle_mass_kg', 60.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-23', '01:00:00', 'weight_kg', 84.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-23', '01:00:00', 'bf_pct', 24.5, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-23', '01:00:00', 'fat_mass_kg', 20.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-23', '01:00:00', 'muscle_mass_kg', 60.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-23', '16:11:00', 'weight_kg', 84.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-23', '16:11:00', 'bf_pct', 24.5, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-23', '16:11:00', 'fat_mass_kg', 20.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-23', '16:11:00', 'muscle_mass_kg', 60.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-23', '23:10:00', 'weight_kg', 85.45, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-23', '23:10:00', 'bf_pct', 24.9, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-23', '23:10:00', 'fat_mass_kg', 21.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-23', '23:10:00', 'muscle_mass_kg', 60.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-24', '03:48:00', 'weight_kg', 85, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-24', '03:48:00', 'bf_pct', 24.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-24', '03:48:00', 'fat_mass_kg', 21, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-24', '03:48:00', 'muscle_mass_kg', 60.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-24', '07:12:00', 'weight_kg', 84.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-24', '07:12:00', 'bf_pct', 24.6, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-24', '07:12:00', 'fat_mass_kg', 20.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-24', '07:12:00', 'muscle_mass_kg', 60.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-24', '12:32:00', 'weight_kg', 84.35, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-24', '12:32:00', 'bf_pct', 24.4, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-24', '12:32:00', 'fat_mass_kg', 20.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-24', '12:32:00', 'muscle_mass_kg', 60.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-25', '20:45:00', 'weight_kg', 83.85, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-25', '20:45:00', 'bf_pct', 24.2, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-25', '20:45:00', 'fat_mass_kg', 20.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-25', '20:45:00', 'muscle_mass_kg', 60.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-27', '11:41:00', 'weight_kg', 83.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-27', '11:41:00', 'bf_pct', 24.1, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-27', '11:41:00', 'fat_mass_kg', 20.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-27', '11:41:00', 'muscle_mass_kg', 60.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-27', '23:21:00', 'weight_kg', 85.65, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-27', '23:21:00', 'bf_pct', 25, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-27', '23:21:00', 'fat_mass_kg', 21.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-27', '23:21:00', 'muscle_mass_kg', 60.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-28', '08:47:00', 'weight_kg', 84.95, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-28', '08:47:00', 'bf_pct', 24.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-28', '08:47:00', 'fat_mass_kg', 21, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-28', '08:47:00', 'muscle_mass_kg', 60.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-28', '22:05:00', 'weight_kg', 85.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-28', '22:05:00', 'bf_pct', 24.8, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-28', '22:05:00', 'fat_mass_kg', 21.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-28', '22:05:00', 'muscle_mass_kg', 60.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-29', '11:13:00', 'weight_kg', 85.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-29', '11:13:00', 'bf_pct', 24.9, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-29', '11:13:00', 'fat_mass_kg', 21.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-29', '11:13:00', 'muscle_mass_kg', 60.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-30', '00:02:00', 'weight_kg', 84.45, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-30', '00:02:00', 'bf_pct', 24.5, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-30', '00:02:00', 'fat_mass_kg', 20.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-30', '00:02:00', 'muscle_mass_kg', 60.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-30', '10:27:00', 'weight_kg', 84.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-30', '10:27:00', 'bf_pct', 24.4, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-30', '10:27:00', 'fat_mass_kg', 20.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-04-30', '10:27:00', 'muscle_mass_kg', 60.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-01', '05:50:00', 'weight_kg', 84.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-01', '05:50:00', 'bf_pct', 24.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-01', '05:50:00', 'fat_mass_kg', 20.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-01', '05:50:00', 'muscle_mass_kg', 60.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-01', '16:21:00', 'weight_kg', 83.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-01', '16:21:00', 'bf_pct', 24.2, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-01', '16:21:00', 'fat_mass_kg', 20.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-01', '16:21:00', 'muscle_mass_kg', 60.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-02', '10:33:00', 'weight_kg', 84.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-02', '10:33:00', 'bf_pct', 24.3, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-02', '10:33:00', 'fat_mass_kg', 20.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-02', '10:33:00', 'muscle_mass_kg', 60.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-02', '10:55:00', 'weight_kg', 83.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-02', '10:55:00', 'bf_pct', 23.9, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-02', '10:55:00', 'fat_mass_kg', 19.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-02', '10:55:00', 'muscle_mass_kg', 59.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-03', '15:31:00', 'weight_kg', 82.85, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-03', '15:31:00', 'bf_pct', 23.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-03', '15:31:00', 'fat_mass_kg', 19.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-03', '15:31:00', 'muscle_mass_kg', 59.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-04', '11:27:00', 'weight_kg', 82.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-04', '11:27:00', 'bf_pct', 23.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-04', '11:27:00', 'fat_mass_kg', 19.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-04', '11:27:00', 'muscle_mass_kg', 59.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-04', '22:18:00', 'weight_kg', 81.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-04', '22:18:00', 'bf_pct', 23.1, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-04', '22:18:00', 'fat_mass_kg', 18.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-04', '22:18:00', 'muscle_mass_kg', 59.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-04', '22:42:00', 'weight_kg', 81.05, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-04', '22:42:00', 'bf_pct', 22.9, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-04', '22:42:00', 'fat_mass_kg', 18.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-04', '22:42:00', 'muscle_mass_kg', 59.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-05', '12:55:00', 'weight_kg', 82.15, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-05', '12:55:00', 'bf_pct', 23.4, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-05', '12:55:00', 'fat_mass_kg', 19.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-05', '12:55:00', 'muscle_mass_kg', 59.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-06', '16:25:00', 'weight_kg', 83.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-06', '16:25:00', 'bf_pct', 24, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-06', '16:25:00', 'fat_mass_kg', 20.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-06', '16:25:00', 'muscle_mass_kg', 60.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-07', '16:59:00', 'weight_kg', 83.15, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-07', '16:59:00', 'bf_pct', 23.9, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-07', '16:59:00', 'fat_mass_kg', 19.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-07', '16:59:00', 'muscle_mass_kg', 60, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-08', '18:00:00', 'weight_kg', 82.05, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-08', '18:00:00', 'bf_pct', 23.4, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-08', '18:00:00', 'fat_mass_kg', 19.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-08', '18:00:00', 'muscle_mass_kg', 59.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-09', '14:20:00', 'weight_kg', 81.05, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-09', '14:20:00', 'bf_pct', 22.9, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-09', '14:20:00', 'fat_mass_kg', 18.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-09', '14:20:00', 'muscle_mass_kg', 59.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-12', '00:38:00', 'weight_kg', 81.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-12', '00:38:00', 'bf_pct', 23.2, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-12', '00:38:00', 'fat_mass_kg', 19, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-12', '00:38:00', 'muscle_mass_kg', 59.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-12', '13:36:00', 'weight_kg', 82.25, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-12', '13:36:00', 'bf_pct', 23.5, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-12', '13:36:00', 'fat_mass_kg', 19.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-12', '13:36:00', 'muscle_mass_kg', 59.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-13', '01:34:00', 'weight_kg', 81.45, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-13', '01:34:00', 'bf_pct', 23.1, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-13', '01:34:00', 'fat_mass_kg', 18.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-13', '01:34:00', 'muscle_mass_kg', 59.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-13', '22:17:00', 'weight_kg', 80.95, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-13', '22:17:00', 'bf_pct', 22.8, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-13', '22:17:00', 'fat_mass_kg', 18.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-13', '22:17:00', 'muscle_mass_kg', 59.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:07:00', 'weight_kg', 81.95, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:07:00', 'bf_pct', 23.3, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:07:00', 'fat_mass_kg', 19.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:07:00', 'muscle_mass_kg', 59.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:39:00', 'weight_kg', 82.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:39:00', 'bf_pct', 23.6, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:39:00', 'fat_mass_kg', 19.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:39:00', 'muscle_mass_kg', 59.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:40:00', 'weight_kg', 81.75, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:40:00', 'bf_pct', 23.2, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:40:00', 'fat_mass_kg', 19, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:40:00', 'muscle_mass_kg', 59.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:40:00', 'weight_kg', 81.75, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:40:00', 'bf_pct', 23.2, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:40:00', 'fat_mass_kg', 19, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:40:00', 'muscle_mass_kg', 59.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:40:00', 'weight_kg', 81.75, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:40:00', 'bf_pct', 23.2, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:40:00', 'fat_mass_kg', 19, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-15', '10:40:00', 'muscle_mass_kg', 59.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-16', '02:24:00', 'weight_kg', 81.35, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-16', '02:24:00', 'bf_pct', 23, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-16', '02:24:00', 'fat_mass_kg', 18.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-16', '02:24:00', 'muscle_mass_kg', 59.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-16', '12:10:00', 'weight_kg', 82.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-16', '12:10:00', 'bf_pct', 23.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-16', '12:10:00', 'fat_mass_kg', 19.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-16', '12:10:00', 'muscle_mass_kg', 59.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-19', '14:49:00', 'weight_kg', 80.85, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-19', '14:49:00', 'bf_pct', 22.8, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-19', '14:49:00', 'fat_mass_kg', 18.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-19', '14:49:00', 'muscle_mass_kg', 59.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-21', '21:25:00', 'weight_kg', 79.65, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-21', '21:25:00', 'bf_pct', 22.2, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-21', '21:25:00', 'fat_mass_kg', 17.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-21', '21:25:00', 'muscle_mass_kg', 58.6, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-24', '15:08:00', 'weight_kg', 82.1, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-24', '15:08:00', 'bf_pct', 23.4, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-24', '15:08:00', 'fat_mass_kg', 19.2, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-24', '15:08:00', 'muscle_mass_kg', 59.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-25', '13:56:00', 'weight_kg', 80.75, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-25', '13:56:00', 'bf_pct', 22.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-25', '13:56:00', 'fat_mass_kg', 18.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-25', '13:56:00', 'muscle_mass_kg', 59, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-25', '22:44:00', 'weight_kg', 80.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-25', '22:44:00', 'bf_pct', 22.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-25', '22:44:00', 'fat_mass_kg', 18.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-25', '22:44:00', 'muscle_mass_kg', 59, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-26', '15:25:00', 'weight_kg', 80.65, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-26', '15:25:00', 'bf_pct', 22.7, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-26', '15:25:00', 'fat_mass_kg', 18.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-26', '15:25:00', 'muscle_mass_kg', 59, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-27', '19:27:00', 'weight_kg', 80.05, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-27', '19:27:00', 'bf_pct', 22.4, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-27', '19:27:00', 'fat_mass_kg', 17.9, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-27', '19:27:00', 'muscle_mass_kg', 58.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-29', '13:51:00', 'weight_kg', 81.85, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-29', '13:51:00', 'bf_pct', 23.3, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-29', '13:51:00', 'fat_mass_kg', 19, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-29', '13:51:00', 'muscle_mass_kg', 59.4, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-29', '15:47:00', 'weight_kg', 81.5, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-29', '15:47:00', 'bf_pct', 23.1, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-29', '15:47:00', 'fat_mass_kg', 18.8, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-29', '15:47:00', 'muscle_mass_kg', 59.3, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-30', '10:50:00', 'weight_kg', 81.25, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-30', '10:50:00', 'bf_pct', 23, '%', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-30', '10:50:00', 'fat_mass_kg', 18.7, 'kg', 'device', 'lafkigafk');
insert into body_metrics (date, time, metric, value, unit, source_type, notes) values ('2026-05-30', '10:50:00', 'muscle_mass_kg', 59.2, 'kg', 'device', 'lafkigafk');
