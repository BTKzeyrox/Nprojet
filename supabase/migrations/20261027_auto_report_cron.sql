-- Rapport automatique (M15.5) : une tâche planifiée appelle le serveur toutes les 15 minutes (route report-due).
-- À appliquer APRÈS la table df_reports (migration 20261027_create_df_reports.sql) : sans la table, la route répond une erreur 500 sans rien casser.
-- Elle utilise le même secret que « df-push-due » et « df-recurring-due » (push_cron_secret). Tant que le réglage « Rapport auto » est sur « Arrêté », elle ne fait rien.
-- NON APPLIQUÉE à ce jour : le fichier est seulement dans le dépôt.
-- Retour en arrière : select cron.unschedule('df-report-due');
select cron.schedule(
  'df-report-due',
  '*/15 * * * *',
  $job$select net.http_post(
    url := 'https://fvkusbdhetxleimtdzqm.supabase.co/functions/v1/df-api/report-due',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )$job$
);
