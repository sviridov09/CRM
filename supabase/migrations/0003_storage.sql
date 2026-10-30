-- Field CRM: хранилище фото и видео
-- Путь файла: <company_id>/<task_id>/<имя файла>

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)   -- до 50 МБ на файл
on conflict (id) do nothing;

-- Бригадир читает все файлы своей компании
create policy "foreman reads company media" on storage.objects for select
  using (bucket_id = 'media' and is_foreman()
         and (storage.foldername(name))[1] = my_company()::text);

-- Рабочий загружает и читает файлы только своих задач
create policy "worker uploads own task media" on storage.objects for insert
  with check (bucket_id = 'media'
              and (storage.foldername(name))[1] = my_company()::text
              and owns_task(((storage.foldername(name))[2])::uuid));

create policy "worker reads own task media" on storage.objects for select
  using (bucket_id = 'media'
         and (storage.foldername(name))[1] = my_company()::text
         and owns_task(((storage.foldername(name))[2])::uuid));
