alter table public.app_users
add column if not exists telegram_user_id text;

create unique index if not exists app_users_telegram_user_id_key
on public.app_users (telegram_user_id)
where telegram_user_id is not null;
