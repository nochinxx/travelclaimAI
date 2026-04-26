create table claim_attachments (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references travel_claims (id) on delete cascade,
  storage_path text not null,
  attachment_type text not null default 'receipt'
    check (attachment_type in ('receipt', 'supporting_document')),
  file_name text,
  file_type text,
  file_size integer,
  ocr_text text,
  extracted_data jsonb not null default '{}'::jsonb,
  confirmed_data jsonb not null default '{}'::jsonb,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'ocr_complete', 'needs_confirmation', 'confirmed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index claim_attachments_claim_id_idx on claim_attachments (claim_id);
create index claim_attachments_status_idx on claim_attachments (status);
create index claim_attachments_attachment_type_idx on claim_attachments (attachment_type);

alter table claim_attachments enable row level security;

-- Current claim access is share-token based. Server routes use the service role
-- key for storage uploads, OCR updates, signed URLs, and confirmation writes.
create policy "Anyone can read claim attachments"
  on claim_attachments for select to anon, authenticated using (true);

create policy "Anyone can create claim attachments"
  on claim_attachments for insert to anon, authenticated with check (true);

create policy "Anyone can update claim attachments"
  on claim_attachments for update to anon, authenticated using (true);

insert into storage.buckets (id, name, public)
values ('claim-attachments', 'claim-attachments', false)
on conflict (id) do nothing;
