-- Missions récurrentes (M15.1) : une tâche planifiée appelle le serveur toutes les 15 minutes.
-- Aucune table n'est créée : les règles sont dans les réglages (clé recurring_missions, réservée à l'admin).
-- Elle utilise le même secret que « df-push-due » (push_cron_secret).
-- Retour en arrière : select cron.unschedule('df-recurring-due');
select cron.schedule(
  'df-recurring-due',
  '*/15 * * * *',
  $job$select net.http_post(
    url := 'https://fvkusbdhetxleimtdzqm.supabase.co/functions/v1/df-api/recurring-due',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )$job$
);
