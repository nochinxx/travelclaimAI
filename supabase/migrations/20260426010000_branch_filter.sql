-- Add optional branch_filter to both search RPCs.
-- When provided, results are scoped to the JTR (branch = 'joint') +
-- the specified branch supplement. Null means no filtering (all branches).

create or replace function match_regulation_chunks (
  query_embedding extensions.vector(768),
  match_threshold float default 0.2,
  match_count int default 8,
  branch_filter text default null
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
  with scoped_chunks as (
    select rag_document_chunks.id
    from rag_document_chunks
    join rag_documents on rag_documents.id = rag_document_chunks.document_id
    where branch_filter is null
       or rag_documents.branch = branch_filter
       or rag_documents.branch = 'joint'
  )
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
  where rag_document_chunks.id in (select id from scoped_chunks)
    and rag_document_chunks.embedding <=> query_embedding < 1 - match_threshold
  order by rag_document_chunks.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

create or replace function hybrid_match_regulation_chunks (
  query_text text,
  query_embedding extensions.vector(768),
  match_threshold float default 0.2,
  match_count int default 8,
  branch_filter text default null
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
  with scoped_chunks as (
    select rag_document_chunks.id
    from rag_document_chunks
    join rag_documents on rag_documents.id = rag_document_chunks.document_id
    where branch_filter is null
       or rag_documents.branch = branch_filter
       or rag_documents.branch = 'joint'
  ),
  semantic_matches as (
    select
      rag_document_chunks.id,
      1 - (rag_document_chunks.embedding <=> query_embedding) as similarity
    from rag_document_chunks
    where rag_document_chunks.id in (select id from scoped_chunks)
      and rag_document_chunks.embedding <=> query_embedding < 1 - match_threshold
    order by rag_document_chunks.embedding <=> query_embedding
    limit least(match_count * 4, 100)
  ),
  keyword_matches as (
    select
      rag_document_chunks.id,
      ts_rank_cd(rag_document_chunks.fts, websearch_to_tsquery('english', query_text)) as keyword_rank
    from rag_document_chunks
    where rag_document_chunks.id in (select id from scoped_chunks)
      and rag_document_chunks.fts @@ websearch_to_tsquery('english', query_text)
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

grant execute on function match_regulation_chunks(extensions.vector, float, int, text) to anon, authenticated;
grant execute on function hybrid_match_regulation_chunks(text, extensions.vector, float, int, text) to anon, authenticated;
