alter table claim_attachments
add column if not exists attachment_type text not null default 'receipt'
  check (attachment_type in ('receipt', 'supporting_document'));

create index if not exists claim_attachments_attachment_type_idx
on claim_attachments (attachment_type);

notify pgrst, 'reload schema';
