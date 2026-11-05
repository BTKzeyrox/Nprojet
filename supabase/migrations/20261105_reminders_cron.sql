-- Rappels (M25.3) : une tâche planifiée appelle le serveur CHAQUE MINUTE. Même secret que « df-push-due » (push_cron_secret).
-- Retour en arrière : select cron.unschedule('df-reminders-due');
select cron.schedule(
  'df-reminders-due',
  '* * * * *',
  $job$select net.http_post(
    url := 'https://fvkusbdhetxleimtdzqm.supabase.co/functions/v1/df-api/reminders-due',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )$job$
);
