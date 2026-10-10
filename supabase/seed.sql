-- Réglages par défaut (le site complète les valeurs manquantes tout seul). À lancer après schema.sql.
insert into public.df_settings (id, data) values ('general', $json$
{
  "id": "general",
  "price_per_million": 1000,
  "day_shift_start": "08:00", "day_shift_end": "18:00",
  "night_shift_start": "20:00", "night_shift_end": "06:00",
  "late_tolerance_min": 15, "access_before_min": 60, "access_after_min": 60,
  "show_activity_column": true, "pay_period": "month",
  "advance_cap_pct": 0, "advance_repay_pct": 100,
  "pay_methods": ["MVola", "Orange Money", "Airtel Money", "Espèces"],
  "penalties_enabled": false,
  "badge_start": true, "badge_end": true, "badge_advance": true, "badge_profile": true, "badges_clickable": true,
  "alert_idle_1_min": 15, "alert_idle_2_min": 30,
  "err_report_enabled": true, "err_max_per_session": 3, "err_hide_details": true, "err_report_button": true,
  "retry_seconds": 15,
  "maintenance_on": false,
  "maintenance_message": "Le site est en maintenance. Réessaie un peu plus tard.",
  "retention_days": 7, "grid_columns": 2, "rules": "",
  "post_types": ["NO R/C", "YES R/C", "RED 9CASE"]
}
$json$::jsonb)
on conflict (id) do nothing;
