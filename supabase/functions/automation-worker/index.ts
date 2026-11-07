import { createClient } from "npm:@supabase/supabase-js@2.45.0";

type AnyRecord = Record<string, any>;
type WorkflowRunStatus = "running" | "success" | "failed" | "skipped";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: AnyRecord, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function safeSegment(value: unknown) {
  return String(value ?? "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function stableId(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function getDoc(path: string) {
  const { data, error } = await db.from("docs").select("data").eq("path", path).maybeSingle();
  if (error) throw error;
  return (data?.data ?? null) as AnyRecord | null;
}

async function saveDoc(path: string, data: AnyRecord) {
  const { error } = await db.from("docs").upsert({
    path,
    data,
    updated_at: new Date().toISOString(),
  }, { onConflict: "path" });
  if (error) throw error;
}

async function createDocOnce(path: string, data: AnyRecord) {
  const { data: existing, error: readError } = await db.from("docs").select("path").eq("path", path).maybeSingle();
  if (readError) throw readError;
  if (existing) return false;

  const { error } = await db.from("docs").insert({ path, data });
  if (error && error.code !== "23505") throw error;
  return !error;
}

function graphFor(workflow: AnyRecord) {
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  if (nodes.some((node: AnyRecord) => node?.type === "trigger") && Array.isArray(workflow.edges)) {
    return { nodes, edges };
  }

  const triggerId = ("legacy_" + workflow.id + "_trigger").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 170);
  const conditionId = ("legacy_" + workflow.id + "_condition").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 170);
  const builtNodes: AnyRecord[] = [{ id: triggerId, type: "trigger", trigger: workflow.trigger }];
  const builtEdges: AnyRecord[] = [];
  const hasCondition = Boolean(String(workflow.condition ?? "").trim());
  let previousId = triggerId;

  if (hasCondition) {
    builtNodes.push({
      id: conditionId,
      type: "condition",
      field: "text",
      operator: "contains",
      value: String(workflow.condition).trim(),
    });
    builtEdges.push({ id: "legacy-edge-trigger-condition", source: triggerId, target: conditionId, sourceHandle: "next" });
    previousId = conditionId;
  }

  const actions = Array.isArray(workflow.actions) ? workflow.actions : [];
  actions.forEach((action: AnyRecord, index: number) => {
    const id = String(action.id || ("legacy_" + workflow.id + "_action_" + index)).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 170);
    builtNodes.push({ id, type: "action", action: { ...action, id } });
    builtEdges.push({
      id: "legacy-edge-" + index,
      source: previousId,
      target: id,
      sourceHandle: hasCondition && index === 0 ? "true" : "next",
    });
    previousId = id;
  });

  return { nodes: builtNodes, edges: builtEdges };
}

function interpolate(template: unknown, workflow: AnyRecord, event: AnyRecord) {
  const payload = event.payload ?? {};
  const values: Record<string, string> = {
    "event.type": String(event.trigger_type ?? ""),
    "event.id": String(payload.id ?? ""),
    "event.title": String(payload.title || payload.summary || "Untitled event"),
    "event.body": String(payload.body || payload.summary || ""),
    "event.communityId": String(payload.communityId ?? ""),
    "event.projectId": String(payload.projectId ?? ""),
    "event.taskId": String(payload.taskId ?? ""),
    "event.entityType": String(payload.entityType ?? ""),
    "event.deadline": payload.deadlineAt ? new Date(Number(payload.deadlineAt)).toLocaleString() : "",
    "event.deadlineAt": String(payload.deadlineAt ?? ""),
    "workflow.name": String(workflow.name ?? "Automation"),
  };
  return String(template ?? "").replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (_whole, key: string) => values[key] ?? _whole).trim();
}

function conditionMatches(node: AnyRecord, event: AnyRecord) {
  const payload = event.payload ?? {};
  let actual = "";
  if (node.field === "title") actual = String(payload.title ?? "");
  else if (node.field === "body") actual = String(payload.body ?? "");
  else if (node.field === "summary") actual = String(payload.summary ?? "");
  else if (node.field === "event.type") actual = String(event.trigger_type ?? "");
  else if (node.field === "event.entityType") actual = String(payload.entityType ?? "");
  else actual = [payload.title, payload.summary, payload.body, event.trigger_type].filter(Boolean).join(" ");

  actual = actual.trim().toLocaleLowerCase();
  const expected = String(node.value ?? "").trim().toLocaleLowerCase();
  if (!expected) return false;
  if (node.operator === "equals") return actual === expected;
  if (node.operator === "not_contains") return !actual.includes(expected);
  if (node.operator === "starts_with") return actual.startsWith(expected);
  return actual.includes(expected);
}

function assertSafeWebhook(raw: string) {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error("Enter a valid HTTPS webhook URL.");
  }
  const host = target.hostname.toLowerCase();
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host.includes(":") ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)
  ) {
    throw new Error("Webhook URLs must use a public HTTPS hostname.");
  }
  return target;
}

async function runAction(
  workflow: AnyRecord,
  ownerId: string,
  event: AnyRecord,
  action: AnyRecord,
  nodeId: string,
  runId: string,
) {
  const actionKey = await stableId(workflow.id + ":" + event.id + ":" + nodeId);
  const at = Date.now();

  if (action.type === "notify") {
    const message = interpolate(
      action.message || "{{workflow.name}} finished for {{event.title}}",
      workflow,
      event,
    ).slice(0, 1000) || String(workflow.name || "Automation") + " ran successfully.";
    const noticeId = "auto_" + actionKey;
    await createDocOnce("data/users/" + ownerId + "/automation-notifications/" + noticeId, {
      id: noticeId,
      userId: ownerId,
      workflowId: workflow.id,
      workflowName: String(workflow.name || "Automation"),
      eventType: event.trigger_type,
      title: String(workflow.name || "Automation").slice(0, 120),
      message,
      at,
      read: false,
      automationRunId: runId,
    });
    return "Saved a notification to your Quorlyth automation inbox.";
  }

  if (action.type === "create_task") {
    const projectId = String(action.projectId || "").trim();
    if (!projectId) throw new Error("Choose a workspace for the task action.");

    const { data: allowed, error: permissionError } = await db.rpc("automation_user_can_create_task", {
      p_user_id: ownerId,
      p_project_id: projectId,
    });
    if (permissionError) throw permissionError;
    if (allowed !== true) throw new Error("This workflow owner no longer has task-management access to the selected workspace.");

    const title = interpolate(action.taskTitle || "Follow up: {{event.title}}", workflow, event).slice(0, 140);
    if (title.length < 2) throw new Error("Give the generated task a title.");
    const description = interpolate(
      action.taskDescription || "Created by {{workflow.name}}.\n\nContext: {{event.body}}",
      workflow,
      event,
    ).slice(0, 2000);
    const acceptanceCriteria = interpolate(action.acceptanceCriteria || "", workflow, event).slice(0, 1000);
    const taskId = "auto_" + actionKey;

    await createDocOnce("standaloneTasks/" + taskId, {
      id: taskId,
      projectId,
      title,
      description,
      acceptanceCriteria,
      status: "todo",
      createdBy: ownerId,
      at,
      updatedAt: at,
      dueAt: null,
      assigneeId: null,
      automationWorkflowId: workflow.id,
      automationRunId: runId,
    });
    return "Created \"" + title + "\" in the selected workspace.";
  }

  if (action.type === "webhook") {
    const target = assertSafeWebhook(String(action.url || "").trim());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(target.toString(), {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/plain, */*",
          "Idempotency-Key": actionKey,
          "X-Quorlyth-Event": String(event.trigger_type || ""),
        },
        body: JSON.stringify({
          event: {
            type: event.trigger_type,
            id: event.payload?.id || null,
            title: event.payload?.title || null,
            summary: event.payload?.summary || event.payload?.body || null,
            communityId: event.payload?.communityId || null,
            projectId: event.payload?.projectId || null,
            taskId: event.payload?.taskId || null,
            milestoneId: event.payload?.milestoneId || null,
            entityType: event.payload?.entityType || null,
            deadlineAt: event.payload?.deadlineAt || null,
            deadline: event.payload?.deadlineAt ? new Date(Number(event.payload.deadlineAt)).toISOString() : null,
            at: event.payload?.at || at,
          },
          workflow: { id: workflow.id, name: workflow.name },
          sentAt: at,
        }),
      });
      if (!response.ok) throw new Error("Webhook endpoint responded with HTTP " + response.status + ".");
      return "Webhook accepted the request (HTTP " + response.status + ").";
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("This workflow contains an unsupported action.");
}

async function executeWorkflow(workflow: AnyRecord, ownerId: string, event: AnyRecord) {
  const workflowId = String(workflow.id || "");
  const runDocId = [workflowId, event.trigger_type, event.id].map(safeSegment).filter(Boolean).join("--").slice(0, 180);
  const runPath = "data/users/" + ownerId + "/automation-runs/" + runDocId;
  const workflowPath = "data/users/" + ownerId + "/automations/" + workflowId;
  const existing = await getDoc(runPath);
  if (existing?.status === "success") return { status: "success", skipped: true };

  const runId = workflowId + ":" + event.trigger_type + ":" + event.id;
  const startedAt = Number(existing?.startedAt) || Date.now();
  let steps: AnyRecord[] = Array.isArray(existing?.steps) ? existing.steps.map((step: AnyRecord) => ({ ...step })) : [];
  let errorMessage = "";

  const makeRun = (status: WorkflowRunStatus) => ({
    id: runId,
    trigger: event.trigger_type,
    status,
    startedAt,
    finishedAt: status === "running" ? 0 : Date.now(),
    steps: steps.map((step) => ({ ...step })),
    eventTitle: String(event.payload?.title || event.payload?.summary || ""),
    ...(errorMessage ? { error: errorMessage } : {}),
  });

  const saveRun = async (status: WorkflowRunStatus) => {
    const run = makeRun(status);
    await saveDoc(runPath, {
      ...run,
      workflowId,
      workflowName: String(workflow.name || "Automation"),
      updatedAt: Date.now(),
    });
    return run;
  };

  const mark = async (node: AnyRecord, status: string, detail: string) => {
    const index = steps.findIndex((step) => step.id === node.id);
    const current = index >= 0 ? steps[index] : null;
    if (current?.status === "success" && status !== "failed") return;
    const step = {
      id: String(node.id),
      nodeId: String(node.id),
      title: node.type === "trigger" ? "Event received"
        : node.type === "condition" ? "Evaluate decision"
        : String(node.action?.title || node.action?.type || "Run action"),
      status,
      detail,
      at: Date.now(),
    };
    if (index >= 0) steps[index] = step;
    else steps.push(step);
    await saveRun("running");
  };

  const { nodes, edges } = graphFor(workflow);
  const byId = new Map<string, AnyRecord>(nodes.map((node: AnyRecord) => [String(node.id), node]));
  const trigger = nodes.find((node: AnyRecord) => node.type === "trigger");
  if (!trigger) throw new Error("This workflow has no trigger node.");

  await mark(trigger, "success", "Event received: " + event.trigger_type);
  let nextEdge = edges.find((edge: AnyRecord) => edge.source === trigger.id && edge.sourceHandle === "next");
  const condition = nodes.find((node: AnyRecord) => node.type === "condition");
  if (condition && nextEdge?.target === condition.id) {
    const matched = conditionMatches(condition, event);
    await mark(condition, "success", matched
      ? "Condition matched. Following the true route."
      : "Condition did not match. Following the false route.");
    nextEdge = edges.find((edge: AnyRecord) =>
      edge.source === condition.id && edge.sourceHandle === (matched ? "true" : "false")
    );
  }

  let currentId = String(nextEdge?.target || "");
  const visited = new Set<string>();
  while (currentId) {
    if (visited.has(currentId)) throw new Error("A workflow loop was detected. The run was stopped safely.");
    visited.add(currentId);
    const node = byId.get(currentId);
    if (!node) throw new Error("A connected workflow node could not be found.");
    if (node.type !== "action") throw new Error("This connection does not lead to an executable action.");

    const savedStep = steps.find((step) => step.id === node.id && step.status === "success");
    if (!savedStep) {
      await mark(node, "running", "Executing " + String(node.action?.title || node.action?.type || "action") + "…");
      try {
        const detail = await runAction(workflow, ownerId, event, node.action || {}, String(node.id), runId);
        await mark(node, "success", detail);
      } catch (error) {
        errorMessage = error instanceof Error ? error.message.slice(0, 400) : "This action failed.";
        await mark(node, "failed", errorMessage);
        const failedRun = await saveRun("failed");
        await db.rpc("append_automation_workflow_run", {
          p_user_id: ownerId,
          p_workflow_id: workflowId,
          p_run: failedRun,
        });
        throw new Error(errorMessage);
      }
    }

    const following = edges.find((edge: AnyRecord) => edge.source === currentId && edge.sourceHandle === "next");
    currentId = String(following?.target || "");
  }

  const finalRun = await saveRun("success");
  const { error: historyError } = await db.rpc("append_automation_workflow_run", {
    p_user_id: ownerId,
    p_workflow_id: workflowId,
    p_run: finalRun,
  });
  if (historyError) throw historyError;
  return { status: "success", skipped: false };
}

async function processEvents() {
  // Time-based deadlines are discovered by the worker, not by a browser timer.
  // The database dispatcher deduplicates each source record + dueAt timestamp.
  const { data: deadlinesEnqueued, error: deadlineError } = await db.rpc(
    "enqueue_due_automation_events",
    { p_limit: 5 },
  );
  if (deadlineError) throw deadlineError;

  const { data: events, error: claimError } = await db.rpc("claim_automation_events", { p_limit: 5 });
  if (claimError) throw claimError;
  if (!Array.isArray(events) || events.length === 0) {
    return { processed: 0, succeeded: 0, retried: 0, deadlinesEnqueued: Number(deadlinesEnqueued || 0) };
  }

  const { data: workflowRows, error: workflowsError } = await db
    .from("docs")
    .select("path,data")
    .like("path", "data/users/%/automations/%")
    .limit(1000);
  if (workflowsError) throw workflowsError;

  const workflows = (workflowRows || []).flatMap((row: AnyRecord) => {
    const match = String(row.path || "").match(/^data\/users\/([^/]+)\/automations\/([^/]+)$/);
    if (!match || !row.data || row.data.status !== "active") return [];
    const id = String(row.data.id || match[2]);
    if (row.data.ownerId && row.data.ownerId !== match[1]) return [];
    return [{ path: row.path, ownerId: match[1], workflow: { ...row.data, id } }];
  });

  let succeeded = 0;
  let retried = 0;
  for (const event of events as AnyRecord[]) {
    const eventId = String(event.event_id || event.id || "");
    const normalizedEvent = { ...event, id: eventId };
    let eventError = "";
    try {
      if (!eventId) throw new Error("The queue returned an event without an ID.");
      const matching = workflows.filter((item) =>
        item.workflow.trigger === normalizedEvent.trigger_type &&
        normalizedEvent.trigger_type !== "manual"
      );

      for (const item of matching) {
        const { data: allowed, error: permissionError } = await db.rpc("automation_user_can_receive_event", {
          p_user_id: item.ownerId,
          p_trigger_type: normalizedEvent.trigger_type,
          p_source_path: normalizedEvent.source_path,
          p_payload: normalizedEvent.payload || {},
        });
        if (permissionError) throw permissionError;
        if (allowed !== true) continue;

        try {
          await executeWorkflow(item.workflow, item.ownerId, normalizedEvent);
        } catch (error) {
          eventError = error instanceof Error ? error.message.slice(0, 500) : "Workflow execution failed.";
        }
      }
    } catch (error) {
      eventError = error instanceof Error ? error.message.slice(0, 500) : "Automation event processing failed.";
    }

    const { error: completeError } = await db.rpc("complete_automation_event", {
      p_event_id: eventId,
      p_success: !eventError,
      p_error: eventError || null,
    });
    if (completeError) throw completeError;
    if (eventError) retried += 1;
    else succeeded += 1;
  }

  return { processed: events.length, succeeded, retried, deadlinesEnqueued: Number(deadlinesEnqueued || 0) };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Worker runtime is missing its Supabase configuration." }, 500);

  const bearer = request.headers.get("authorization") || "";
  const token = bearer.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!token) return json({ error: "Unauthorized" }, 401);

  const { data: authorized, error: authError } = await db.rpc("verify_automation_worker_token", {
    p_token: token,
  });
  if (authError || authorized !== true) return json({ error: "Unauthorized" }, 401);

  try {
    const result = await processEvents();
    return json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automation worker failed.";
    console.error("Quorlyth automation worker error:", message);
    return json({ ok: false, error: "The worker could not complete this batch." }, 500);
  }
});
