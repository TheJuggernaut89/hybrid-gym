-- ============================================================================
-- 007 — CLASS QUOTA
--
-- The offers layer can suggest a tier upgrade, but only once a member has
-- genuinely used up the classes their tier includes — never as a pre-emptive
-- nudge. That requires knowing the quota, and nothing in the schema did.
--
-- NULL means unlimited, which is also the default: until a gym actually
-- configures tiers, the upgrade offer simply never fires. That is the correct
-- failure mode for a commercial prompt — silent, not guessed.
-- ============================================================================

alter table public.fighters
  add column if not exists class_quota int
  check (class_quota is null or class_quota > 0);

comment on column public.fighters.class_quota is
  'Classes included per week by this member''s tier. NULL = unlimited; the tier-upgrade offer never fires while NULL.';
