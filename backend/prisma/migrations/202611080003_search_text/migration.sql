BEGIN;
-- Read-time full text over canonical committed projections; no backfill or copied source store.
-- Only TipTap text/content nodes contribute; attributes/URLs/mark names are not body text.
CREATE FUNCTION devsync_document_text(value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE result text := ''; child jsonb;
BEGIN
  IF jsonb_typeof(value) = 'string' THEN RETURN value #>> '{}'; END IF;
  IF jsonb_typeof(value) <> 'object' OR value IS NULL THEN RETURN ''; END IF;
  IF value->>'type' = 'text' THEN RETURN COALESCE(value->>'text',''); END IF;
  IF value->>'type' = 'hardBreak' THEN RETURN E'\n'; END IF;
  IF jsonb_typeof(value->'content') = 'array' THEN
    FOR child IN SELECT * FROM jsonb_array_elements(value->'content') LOOP
      result := result || devsync_document_text(child);
      IF value->>'type' NOT IN ('paragraph','heading','codeBlock') THEN result := result || E'\n'; END IF;
    END LOOP;
  END IF;
  RETURN result;
END;
$$;
-- Expression indexes track each canonical write transaction automatically.
-- Standard CREATE INDEX takes a table write lock: schedule deployment with the operator.
CREATE INDEX "Document_search_text_idx" ON "Document" USING GIN
  (to_tsvector('simple', title || E'\n' || devsync_document_text(content))) WHERE NOT "isArchived";
CREATE INDEX "Snippet_search_text_idx" ON "Snippet" USING GIN
  (to_tsvector('simple', title || E'\n' || (COALESCE(description,'') || E'\n' || code)));
CREATE INDEX "Task_search_text_idx" ON "Task" USING GIN
  (to_tsvector('simple', title || E'\n' || (COALESCE("taskKey",'') || E'\n' || COALESCE(description,''))));
CREATE INDEX "DecisionReceipt_search_text_idx" ON "DecisionReceipt" USING GIN
  (to_tsvector('simple', title || E'\n' || (rationale || E'\n' || excerpt)));
COMMIT;
