create extension if not exists vector with schema extensions;

create type rag_document_visibility as enum ('public', 'private');

create table rag_documents (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  title text not null,
  branch text,
  source_path text,
  checksum_sha256 text,
  visibility rag_document_visibility not null default 'private',
  owner_id uuid references auth.users (id) default auth.uid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rag_documents_public_has_no_owner check (
    visibility <> 'public' or owner_id is null
  )
);

create table rag_document_owners (
  document_id uuid not null references rag_documents (id) on delete cascade,
  owner_id uuid not null references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (document_id, owner_id)
);

create table rag_document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references rag_documents (id) on delete cascade,
  external_id text unique,
  content text not null,
  page_number integer,
  chunk_index integer not null,
  token_count integer,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(768) not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now()
);

create index rag_documents_owner_id_idx on rag_documents (owner_id);
create index rag_document_owners_owner_id_idx on rag_document_owners (owner_id);
create index rag_document_chunks_document_id_idx on rag_document_chunks (document_id);
create index rag_document_chunks_fts_idx on rag_document_chunks using gin (fts);
create index rag_document_chunks_embedding_hnsw_idx
  on rag_document_chunks
  using hnsw (embedding vector_cosine_ops);

alter table rag_documents enable row level security;
alter table rag_document_owners enable row level security;
alter table rag_document_chunks enable row level security;

create policy "Users can read public or owned RAG documents"
on rag_documents for select to anon, authenticated using (
  visibility = 'public'
  or (select auth.uid()) is not null and owner_id = (select auth.uid())
  or exists (
    select 1
    from rag_document_owners
    where rag_document_owners.document_id = rag_documents.id
      and rag_document_owners.owner_id = (select auth.uid())
  )
);

create policy "Users can manage their own RAG documents"
on rag_documents for all to authenticated using (
  owner_id = (select auth.uid())
) with check (
  owner_id = (select auth.uid())
);

create policy "Users can read their RAG document ownership rows"
on rag_document_owners for select to authenticated using (
  owner_id = (select auth.uid())
  or exists (
    select 1
    from rag_documents
    where rag_documents.id = rag_document_owners.document_id
      and rag_documents.owner_id = (select auth.uid())
  )
);

create policy "Document owners can manage RAG access grants"
on rag_document_owners for all to authenticated using (
  exists (
    select 1
    from rag_documents
    where rag_documents.id = rag_document_owners.document_id
      and rag_documents.owner_id = (select auth.uid())
  )
) with check (
  exists (
    select 1
    from rag_documents
    where rag_documents.id = rag_document_owners.document_id
      and rag_documents.owner_id = (select auth.uid())
  )
);

create policy "Users can read allowed RAG document chunks"
on rag_document_chunks for select to anon, authenticated using (
  exists (
    select 1
    from rag_documents
    where rag_documents.id = rag_document_chunks.document_id
      and (
        rag_documents.visibility = 'public'
        or (select auth.uid()) is not null and rag_documents.owner_id = (select auth.uid())
        or exists (
          select 1
          from rag_document_owners
          where rag_document_owners.document_id = rag_documents.id
            and rag_document_owners.owner_id = (select auth.uid())
        )
      )
  )
);

create policy "Document owners can manage RAG document chunks"
on rag_document_chunks for all to authenticated using (
  exists (
    select 1
    from rag_documents
    where rag_documents.id = rag_document_chunks.document_id
      and rag_documents.owner_id = (select auth.uid())
  )
) with check (
  exists (
    select 1
    from rag_documents
    where rag_documents.id = rag_document_chunks.document_id
      and rag_documents.owner_id = (select auth.uid())
  )
);

create or replace function match_regulation_chunks (
  query_embedding extensions.vector(768),
  match_threshold float default 0.2,
  match_count int default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  branch text,
  source_path text,
  page_number integer,
  content text,
  similarity float,
  metadata jsonb
)
language sql
stable
as $$
  select
    rag_document_chunks.id as chunk_id,
    rag_documents.id as document_id,
    rag_documents.title,
    rag_documents.branch,
    rag_documents.source_path,
    rag_document_chunks.page_number,
    rag_document_chunks.content,
    1 - (rag_document_chunks.embedding <=> query_embedding) as similarity,
    rag_document_chunks.metadata
  from rag_document_chunks
  join rag_documents on rag_documents.id = rag_document_chunks.document_id
  where rag_document_chunks.embedding <=> query_embedding < 1 - match_threshold
  order by rag_document_chunks.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

create or replace function hybrid_match_regulation_chunks (
  query_text text,
  query_embedding extensions.vector(768),
  match_threshold float default 0.2,
  match_count int default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  branch text,
  source_path text,
  page_number integer,
  content text,
  similarity float,
  keyword_rank float,
  metadata jsonb
)
language sql
stable
as $$
  with semantic_matches as (
    select
      rag_document_chunks.id,
      1 - (rag_document_chunks.embedding <=> query_embedding) as similarity
    from rag_document_chunks
    where rag_document_chunks.embedding <=> query_embedding < 1 - match_threshold
    order by rag_document_chunks.embedding <=> query_embedding
    limit least(match_count * 4, 100)
  ),
  keyword_matches as (
    select
      rag_document_chunks.id,
      ts_rank_cd(rag_document_chunks.fts, websearch_to_tsquery('english', query_text)) as keyword_rank
    from rag_document_chunks
    where rag_document_chunks.fts @@ websearch_to_tsquery('english', query_text)
    order by keyword_rank desc
    limit least(match_count * 4, 100)
  )
  select
    rag_document_chunks.id as chunk_id,
    rag_documents.id as document_id,
    rag_documents.title,
    rag_documents.branch,
    rag_documents.source_path,
    rag_document_chunks.page_number,
    rag_document_chunks.content,
    coalesce(semantic_matches.similarity, 0) as similarity,
    coalesce(keyword_matches.keyword_rank, 0) as keyword_rank,
    rag_document_chunks.metadata
  from rag_document_chunks
  join rag_documents on rag_documents.id = rag_document_chunks.document_id
  left join semantic_matches on semantic_matches.id = rag_document_chunks.id
  left join keyword_matches on keyword_matches.id = rag_document_chunks.id
  where semantic_matches.id is not null or keyword_matches.id is not null
  order by
    (coalesce(semantic_matches.similarity, 0) * 0.75)
      + (least(coalesce(keyword_matches.keyword_rank, 0), 1) * 0.25) desc
  limit least(match_count, 50);
$$;

grant select on rag_documents to anon, authenticated;
grant select on rag_document_chunks to anon, authenticated;
grant select on rag_document_owners to authenticated;
grant insert, update, delete on rag_documents to authenticated;
grant insert, update, delete on rag_document_chunks to authenticated;
grant insert, update, delete on rag_document_owners to authenticated;
grant execute on function match_regulation_chunks(extensions.vector, float, int) to anon, authenticated;
grant execute on function hybrid_match_regulation_chunks(text, extensions.vector, float, int) to anon, authenticated;
