create table travel_claims (
  id uuid primary key default gen_random_uuid(),
  share_token text unique not null,
  status text not null default 'authorized'
    check (status in ('authorized', 'in_progress', 'submitted')),
  auth_data jsonb not null default '{}'::jsonb,
  soldier_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index travel_claims_share_token_idx on travel_claims (share_token);

alter table travel_claims enable row level security;

-- Share token acts as the secret — anyone with it can read and update the claim.
-- Tighten with proper auth when user accounts are introduced.
create policy "Token holders can read claims"
  on travel_claims for select to anon, authenticated using (true);

create policy "Anyone can create a claim"
  on travel_claims for insert to anon, authenticated with check (true);

create policy "Token holders can update claims"
  on travel_claims for update to anon, authenticated using (true);
