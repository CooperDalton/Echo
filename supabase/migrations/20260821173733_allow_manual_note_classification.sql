alter table public.notes
  drop constraint if exists notes_classification_method_check;

alter table public.notes
  add constraint notes_classification_method_check
  check (classification_method in ('ai', 'manual', 'keyword', 'unknown'))
  not valid;

alter table public.notes
  validate constraint notes_classification_method_check;
