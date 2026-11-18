-- Expression indexes drizzle-kit cannot write. scripts/regenerate-baseline.mjs puts each in place of the generated index of the same name.
CREATE INDEX agent_runs_root ON agent_runs(COALESCE(json_extract(mandate_json,'$.rootRunId'),id));
CREATE UNIQUE INDEX grants_member_identity ON grants(member_id,coalesce(agent_id,''),coalesce(project_id,''),policy_id) WHERE member_id IS NOT NULL AND policy_id IS NOT NULL;
CREATE UNIQUE INDEX grants_role_identity ON grants(role_id,coalesce(agent_id,''),coalesce(project_id,''),policy_id) WHERE role_id IS NOT NULL AND policy_id IS NOT NULL;
CREATE UNIQUE INDEX grants_connection_identity ON grants(connection_id,coalesce(member_id,''),coalesce(role_id,'')) WHERE connection_id IS NOT NULL;
