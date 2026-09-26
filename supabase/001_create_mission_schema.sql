create extension if not exists pgcrypto;

create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  session_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'open',
  current_scene text not null default 'boot',
  mission_accepted boolean not null default false,
  mission_accepted_at timestamptz,
  no_attempt_count integer not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  mission_name text not null default 'AGENT PRISM',
  target_answer text not null default 'HARRY POTTER ESCAPE ROOM',
  final_answer text,
  report_generated boolean not null default false,
  report_generated_at timestamptz,
  report_shared boolean not null default false,
  report_shared_at timestamptz
);

create table if not exists mission_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_mission_events_idempotency
  on mission_events (mission_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists guesses (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  guess_text text not null,
  normalized_guess text not null,
  guess_number integer not null,
  correct boolean not null default false,
  created_at timestamptz not null default now(),
  unique (mission_id, guess_number)
);

create table if not exists hints (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  hint_number integer not null,
  unlocked boolean not null default true,
  unlocked_at timestamptz not null default now(),
  unique (mission_id, hint_number)
);

create table if not exists hangman_state (
  mission_id uuid primary key references missions(id) on delete cascade,
  phrase text not null default 'HARRY POTTER ESCAPE ROOM',
  revealed_letters text[] not null default array[]::text[],
  selected_letters text[] not null default array[]::text[],
  incorrect_letters text[] not null default array[]::text[],
  lives integer not null default 6,
  max_lives integer not null default 6,
  save_count integer not null default 0,
  status text not null default 'active',
  updated_at timestamptz not null default now()
);

create table if not exists hangman_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  event_type text not null,
  selected_letter text,
  correct boolean,
  lives_before integer,
  lives_after integer,
  revealed_state text[] not null default array[]::text[],
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_hangman_events_idempotency
  on hangman_events (mission_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists kiss_protocol (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  accepted boolean not null default false,
  accepted_at timestamptz not null default now(),
  unique (mission_id)
);

create table if not exists direct_answer_attempts (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  requested boolean not null default false,
  cost integer not null default 100,
  answer text,
  normalized_answer text,
  correct boolean not null default false,
  created_at timestamptz not null default now(),
  idempotency_key text
);

create unique index if not exists ux_direct_answer_attempts_idempotency
  on direct_answer_attempts (mission_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists report (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  generated boolean not null default false,
  generated_at timestamptz,
  shared boolean not null default false,
  shared_at timestamptz,
  unique (mission_id)
);

create table if not exists mission_file_reads (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  file_name text not null,
  opened_at timestamptz not null default now(),
  unique (mission_id, file_name)
);

create index if not exists idx_mission_events_mission_id on mission_events (mission_id, created_at desc);
create index if not exists idx_guesses_mission_id on guesses (mission_id, created_at desc);
create index if not exists idx_hints_mission_id on hints (mission_id, hint_number);
create index if not exists idx_hangman_events_mission_id on hangman_events (mission_id, created_at desc);
create index if not exists idx_direct_answer_attempts_mission_id on direct_answer_attempts (mission_id, created_at desc);
create index if not exists idx_mission_file_reads_mission_id on mission_file_reads (mission_id, opened_at desc);

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger set_missions_updated_at
before update on missions
for each row
execute procedure update_updated_at_column();

create or replace trigger set_hangman_updated_at
before update on hangman_state
for each row
execute procedure update_updated_at_column();

alter table missions enable row level security;
alter table mission_events enable row level security;
alter table guesses enable row level security;
alter table hints enable row level security;
alter table hangman_state enable row level security;
alter table hangman_events enable row level security;
alter table kiss_protocol enable row level security;
alter table direct_answer_attempts enable row level security;
alter table report enable row level security;
alter table mission_file_reads enable row level security;

create policy "mission_owner_select" on missions
for select using (owner_id = auth.uid());

create policy "mission_owner_insert" on missions
for insert with check (owner_id = auth.uid());

create policy "mission_owner_update" on missions
for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "mission_owner_delete" on missions
for delete using (owner_id = auth.uid());

create policy "mission_event_owner_select" on mission_events
for select using (
  exists (
    select 1 from missions m where m.id = mission_events.mission_id and m.owner_id = auth.uid()
  )
);

create policy "mission_event_owner_insert" on mission_events
for insert with check (
  exists (
    select 1 from missions m where m.id = mission_events.mission_id and m.owner_id = auth.uid()
  )
);

create policy "mission_event_owner_update" on mission_events
for update using (
  exists (
    select 1 from missions m where m.id = mission_events.mission_id and m.owner_id = auth.uid()
  )
) with check (
  exists (
    select 1 from missions m where m.id = mission_events.mission_id and m.owner_id = auth.uid()
  )
);

create policy "guess_owner_select" on guesses
for select using (
  exists (
    select 1 from missions m where m.id = guesses.mission_id and m.owner_id = auth.uid()
  )
);

create policy "guess_owner_insert" on guesses
for insert with check (
  exists (
    select 1 from missions m where m.id = guesses.mission_id and m.owner_id = auth.uid()
  )
);

create policy "hint_owner_select" on hints
for select using (
  exists (
    select 1 from missions m where m.id = hints.mission_id and m.owner_id = auth.uid()
  )
);

create policy "hint_owner_insert" on hints
for insert with check (
  exists (
    select 1 from missions m where m.id = hints.mission_id and m.owner_id = auth.uid()
  )
);

create policy "hangman_state_owner_select" on hangman_state
for select using (
  exists (
    select 1 from missions m where m.id = hangman_state.mission_id and m.owner_id = auth.uid()
  )
);

create policy "hangman_state_owner_insert" on hangman_state
for insert with check (
  exists (
    select 1 from missions m where m.id = hangman_state.mission_id and m.owner_id = auth.uid()
  )
);

create policy "hangman_state_owner_update" on hangman_state
for update using (
  exists (
    select 1 from missions m where m.id = hangman_state.mission_id and m.owner_id = auth.uid()
  )
) with check (
  exists (
    select 1 from missions m where m.id = hangman_state.mission_id and m.owner_id = auth.uid()
  )
);

create policy "hangman_event_owner_select" on hangman_events
for select using (
  exists (
    select 1 from missions m where m.id = hangman_events.mission_id and m.owner_id = auth.uid()
  )
);

create policy "hangman_event_owner_insert" on hangman_events
for insert with check (
  exists (
    select 1 from missions m where m.id = hangman_events.mission_id and m.owner_id = auth.uid()
  )
);

create policy "kiss_protocol_owner_select" on kiss_protocol
for select using (
  exists (
    select 1 from missions m where m.id = kiss_protocol.mission_id and m.owner_id = auth.uid()
  )
);

create policy "kiss_protocol_owner_insert" on kiss_protocol
for insert with check (
  exists (
    select 1 from missions m where m.id = kiss_protocol.mission_id and m.owner_id = auth.uid()
  )
);

create policy "direct_answer_owner_select" on direct_answer_attempts
for select using (
  exists (
    select 1 from missions m where m.id = direct_answer_attempts.mission_id and m.owner_id = auth.uid()
  )
);

create policy "direct_answer_owner_insert" on direct_answer_attempts
for insert with check (
  exists (
    select 1 from missions m where m.id = direct_answer_attempts.mission_id and m.owner_id = auth.uid()
  )
);

create policy "report_owner_select" on report
for select using (
  exists (
    select 1 from missions m where m.id = report.mission_id and m.owner_id = auth.uid()
  )
);

create policy "report_owner_insert" on report
for insert with check (
  exists (
    select 1 from missions m where m.id = report.mission_id and m.owner_id = auth.uid()
  )
);

create policy "report_owner_update" on report
for update using (
  exists (
    select 1 from missions m where m.id = report.mission_id and m.owner_id = auth.uid()
  )
) with check (
  exists (
    select 1 from missions m where m.id = report.mission_id and m.owner_id = auth.uid()
  )
);

create policy "mission_file_reads_owner_select" on mission_file_reads
for select using (
  exists (
    select 1 from missions m where m.id = mission_file_reads.mission_id and m.owner_id = auth.uid()
  )
);

create policy "mission_file_reads_owner_insert" on mission_file_reads
for insert with check (
  exists (
    select 1 from missions m where m.id = mission_file_reads.mission_id and m.owner_id = auth.uid()
  )
);

create policy "command_center_admin_view" on missions
for select using (auth.role() = 'authenticated');
create policy "command_center_admin_view_events" on mission_events
for select using (auth.role() = 'authenticated');
create policy "command_center_admin_view_guesses" on guesses
for select using (auth.role() = 'authenticated');
create policy "command_center_admin_view_hints" on hints
for select using (auth.role() = 'authenticated');
create policy "command_center_admin_view_hangman" on hangman_state
for select using (auth.role() = 'authenticated');
create policy "command_center_admin_view_hangman_events" on hangman_events
for select using (auth.role() = 'authenticated');
create policy "command_center_admin_view_kiss" on kiss_protocol
for select using (auth.role() = 'authenticated');
create policy "command_center_admin_view_direct" on direct_answer_attempts
for select using (auth.role() = 'authenticated');
create policy "command_center_admin_view_reports" on report
for select using (auth.role() = 'authenticated');

create policy "command_center_admin_view_files" on mission_file_reads
for select using (auth.role() = 'authenticated');
