-- Ensure deletes of auth users can efficiently maintain the actor foreign key.
create index if not exists growth_events_actor_occurred_at_idx
  on public.growth_events (actor_id, occurred_at desc)
  where actor_id is not null;
