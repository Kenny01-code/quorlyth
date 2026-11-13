-- Quorlyth collaboration permissions
-- Draft only. Review before applying to production.
-- Does not drop or replace existing policies.

-- Signed-in members can read shared review decisions.
CREATE POLICY "members read reviews"
ON public.docs
FOR SELECT
TO authenticated
USING (path ~ '^reviews/[^/]+$');

-- Signed-in members can read project records.
CREATE POLICY "members read projects"
ON public.docs
FOR SELECT
TO authenticated
USING (path ~ '^projects/[^/]+$');

-- Signed-in members can read milestone records.
CREATE POLICY "members read milestones"
ON public.docs
FOR SELECT
TO authenticated
USING (path ~ '^milestones/[^/]+$');

-- Members may create collaboration applications only for themselves.
CREATE POLICY "members create own volunteer applications"
ON public.docs
FOR INSERT
TO authenticated
WITH CHECK (
  path ~ '^volunteers/[^/]+$'
  AND data->>'applicantId' = auth.uid()::text
  AND data->>'status' = 'pending'
);

-- Members may read their own collaboration applications.
CREATE POLICY "members read own volunteer applications"
ON public.docs
FOR SELECT
TO authenticated
USING (
  path ~ '^volunteers/[^/]+$'
  AND data->>'applicantId' = auth.uid()::text
);
