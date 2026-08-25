-- P0-2 step 3 (K-34): an allocation's capture is now retried through the outbox,
-- so exactly-once has to be enforced by the database rather than by the caller
-- remembering not to ask twice. `reference` names what the money was for
-- ("offering:<id>" for a settlement, the distribution id for a payout).
--
-- Postgres treats NULLs as distinct, so every entry written before this column
-- existed stays legal and unconstrained.
CREATE UNIQUE INDEX "ledger_entries_investor_id_kind_reference_key" ON "ledger_entries"("investor_id", "kind", "reference");
