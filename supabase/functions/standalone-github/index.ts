import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function repoFromUrl(input: unknown): { owner: string; repo: string; fullName: string } | null {
  const raw = cleanText(input, 600);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.username || url.password) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const owner = segments[0].trim();
    const repo = segments[1].replace(/\.git$/i, "").trim();
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo === "." || repo === "..") return null;
    if (segments.length > 2 && !["tree", "commits", "commit", "pull", "issues", "actions"].includes(segments[2])) return null;
    return { owner, repo, fullName: owner + "/" + repo };
  } catch {
    return null;
  }
}

async function githubGet(path: string) {
  const token = Deno.env.get("GITHUB_TOKEN");
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Quorlyth-Workspace-Integration",
  };
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch("https://api.github.com" + path, { headers });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 404
      ? "GitHub could not find this public repository or source record. Check the repository URL and visibility."
      : response.status === 403 || response.status === 429
        ? "GitHub API rate limit reached. Try again later."
        : "GitHub could not verify this source record.";
    throw new Error(message);
  }
  return json;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond(405, { error: "Use POST for GitHub workspace actions." });

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return respond(401, { error: "Sign in to use the GitHub workspace integration." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return respond(500, { error: "GitHub integration is not configured on the server." });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return respond(401, { error: "Your session is no longer valid. Sign in again." });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respond(400, { error: "Send a valid JSON request." });
  }

  const action = cleanText(body.action, 40);
  const projectId = cleanText(body.projectId, 100);
  if (!projectId || !/^[A-Za-z0-9_-]{1,100}$/.test(projectId)) return respond(400, { error: "Choose a valid workspace." });

  const getDoc = async (path: string) => {
    const { data, error } = await serviceClient.from("docs").select("path,data").eq("path", path).maybeSingle();
    if (error) throw new Error("Could not check workspace access.");
    return data as { path: string; data: Record<string, unknown> } | null;
  };

  try {
    const project = await getDoc("standaloneProjects/" + projectId);
    if (!project || project.data.id !== projectId || project.data.status !== "active") {
      return respond(404, { error: "This active standalone workspace was not found." });
    }

    let role = "";
    if (project.data.createdBy === user.id) {
      role = "owner";
    } else {
      const member = await getDoc("standaloneProjectMembers/" + projectId + "__" + user.id);
      if (member?.data.userId === user.id && member.data.projectId === projectId && member.data.status === "active") {
        role = cleanText(member.data.role, 30);
      }
    }
    if (!["owner", "manager", "contributor", "viewer"].includes(role)) {
      return respond(403, { error: "You need an active project invitation to connect GitHub evidence here." });
    }

    if (action === "connect_repository") {
      if (!["owner", "manager"].includes(role)) return respond(403, { error: "Only project owners and managers can connect a repository." });
      const parsedRepo = repoFromUrl(body.repositoryUrl);
      if (!parsedRepo) return respond(400, { error: "Enter a valid GitHub repository URL, such as https://github.com/owner/repository." });

      const repo = await githubGet("/repos/" + encodeURIComponent(parsedRepo.owner) + "/" + encodeURIComponent(parsedRepo.repo));
      if (repo.private === true) {
        return respond(400, { error: "This first GitHub connector supports public repositories. Private repository OAuth access has not been enabled yet." });
      }
      if (repo.archived === true) {
        return respond(400, { error: "This repository is archived. Connect an active repository to track current work." });
      }

      const now = Date.now();
      const canonicalName = cleanText(repo.full_name, 220);
      const { data: existingRows, error: existingError } = await serviceClient
        .from("docs").select("path,data").like("path", "standaloneGithubRepos/%").limit(1000);
      if (existingError) throw new Error("GitHub was checked, but the workspace repository list could not be loaded.");
      const existing = (existingRows || []).find((row: { path: string; data: Record<string, unknown> }) =>
        row.data.projectId === projectId && cleanText(row.data.fullName, 220).toLowerCase() === canonicalName.toLowerCase()
      );
      const repoId = existing ? cleanText(existing.data.id, 100) : crypto.randomUUID();
      const repoDoc = {
        id: repoId,
        projectId,
        repositoryId: Number(repo.id),
        fullName: canonicalName,
        htmlUrl: cleanText(repo.html_url, 600),
        description: cleanText(repo.description, 1000),
        defaultBranch: cleanText(repo.default_branch, 150),
        language: cleanText(repo.language, 100),
        stars: Number(repo.stargazers_count) || 0,
        openIssues: Number(repo.open_issues_count) || 0,
        visibility: "public",
        connectedBy: existing ? existing.data.connectedBy : user.id,
        connectedAt: existing ? existing.data.connectedAt : now,
        lastSyncedAt: now,
        sourceVerified: true,
        provider: "github",
      };
      const recordPath = "standaloneGithubRepos/" + repoId;
      const write = existing
        ? await serviceClient.from("docs").update({ data: repoDoc }).eq("path", recordPath)
        : await serviceClient.from("docs").insert({ path: recordPath, data: repoDoc });
      if (write.error) throw new Error("Repository details were confirmed, but the workspace could not save the connection.");

      const recentCommits = await githubGet("/repos/" + encodeURIComponent(parsedRepo.owner) + "/" + encodeURIComponent(parsedRepo.repo) + "/commits?per_page=5");
      const commits = Array.isArray(recentCommits) ? recentCommits.slice(0, 5).map((commit: any) => ({
        sha: cleanText(commit.sha, 64),
        shortSha: cleanText(commit.sha, 7),
        url: cleanText(commit.html_url, 600),
        message: cleanText(commit.commit?.message, 240).split("\n")[0],
        authorLogin: cleanText(commit.author?.login, 100) || null,
        authorName: cleanText(commit.commit?.author?.name, 120) || null,
        date: cleanText(commit.commit?.author?.date, 80) || null,
      })) : [];
      return respond(200, { ok: true, repository: repoDoc, commits, note: "GitHub confirmed this public repository and its visible commit metadata. The repository's authors are not yet linked to Quorlyth accounts." });
    }

    if (action === "verify_artifact") {
      if (!["owner", "manager", "contributor"].includes(role)) return respond(403, { error: "Project viewers cannot submit contribution evidence." });
      const taskId = cleanText(body.taskId, 100);
      const artifactUrl = cleanText(body.artifactUrl, 800);
      if (!taskId || !/^[A-Za-z0-9_-]{1,100}$/.test(taskId)) return respond(400, { error: "Select the task this GitHub record supports." });
      const task = await getDoc("standaloneTasks/" + taskId);
      if (!task || task.data.projectId !== projectId || task.data.status === "done") {
        return respond(404, { error: "Choose an open task in this workspace." });
      }
      let url: URL;
      try { url = new URL(artifactUrl); } catch { return respond(400, { error: "Paste a GitHub commit or pull request URL." }); }
      if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.username || url.password) {
        return respond(400, { error: "Only canonical HTTPS GitHub commit and pull request URLs can be source-checked." });
      }
      const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(commit|pull)\/([A-Fa-f0-9]+)$/);
      if (!match) return respond(400, { error: "Use a GitHub commit URL or pull request URL, not a repository homepage or a pasted text claim." });
      const owner = match[1];
      const repoName = match[2].replace(/\.git$/i, "");
      const kind = match[3] === "commit" ? "commit" : "pull_request";
      const sourceId = match[4];
      if (kind === "commit" && !/^[a-fA-F0-9]{7,64}$/.test(sourceId)) return respond(400, { error: "That commit hash does not look valid." });
      if (kind === "pull_request" && !/^\d{1,10}$/.test(sourceId)) return respond(400, { error: "That pull request number does not look valid." });

      const { data: repositoryRows, error: repositoryError } = await serviceClient
        .from("docs").select("path,data").like("path", "standaloneGithubRepos/%").limit(1000);
      if (repositoryError) throw new Error("Could not load the connected repositories.");
      const connected = (repositoryRows || []).find((row: { path: string; data: Record<string, unknown> }) =>
        row.data.projectId === projectId && cleanText(row.data.fullName, 220).toLowerCase() === (owner + "/" + repoName).toLowerCase()
          && row.data.sourceVerified === true && row.data.provider === "github"
      );
      if (!connected) return respond(400, { error: "Connect this public repository to the workspace before submitting its commits or pull requests." });

      const apiRepo = "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repoName);
      let metadata: Record<string, unknown>;
      let canonicalUrl = "";
      let summary = "";
      if (kind === "commit") {
        const sha = sourceId.toLowerCase();
        const commit = await githubGet(apiRepo + "/commits/" + encodeURIComponent(sha));
        canonicalUrl = cleanText(commit.html_url, 600);
        summary = "GitHub commit · " + cleanText(commit.commit?.message, 200).split("\n")[0];
        metadata = {
          source: "github_api",
          repository: cleanText(commit.repository?.full_name, 220) || cleanText(connected.data.fullName, 220),
          sha: cleanText(commit.sha, 64),
          authorLogin: cleanText(commit.author?.login, 100) || null,
          authorName: cleanText(commit.commit?.author?.name, 160) || null,
          authorDate: cleanText(commit.commit?.author?.date, 80) || null,
          committerLogin: cleanText(commit.committer?.login, 100) || null,
          message: cleanText(commit.commit?.message, 2000),
          signatureVerified: commit.commit?.verification?.verified === true,
          signatureReason: cleanText(commit.commit?.verification?.reason, 120) || null,
        };
      } else {
        const number = Number(sourceId);
        const pull = await githubGet(apiRepo + "/pulls/" + number);
        canonicalUrl = cleanText(pull.html_url, 600);
        summary = "GitHub pull request · " + cleanText(pull.title, 180);
        metadata = {
          source: "github_api",
          repository: cleanText(pull.base?.repo?.full_name, 220) || cleanText(connected.data.fullName, 220),
          pullRequestNumber: number,
          title: cleanText(pull.title, 240),
          authorLogin: cleanText(pull.user?.login, 100) || null,
          authorId: Number(pull.user?.id) || null,
          state: cleanText(pull.state, 30),
          merged: pull.merged === true,
          mergedAt: cleanText(pull.merged_at, 80) || null,
          createdAt: cleanText(pull.created_at, 80) || null,
          updatedAt: cleanText(pull.updated_at, 80) || null,
          baseBranch: cleanText(pull.base?.ref, 150),
          headSha: cleanText(pull.head?.sha, 64),
        };
      }

      if (!canonicalUrl || !canonicalUrl.startsWith("https://github.com/")) throw new Error("GitHub returned an invalid canonical source URL.");
      const now = Date.now();
      const artifactId = crypto.randomUUID();
      const artifact = {
        id: artifactId,
        projectId,
        taskId,
        provider: "github",
        kind,
        url: canonicalUrl,
        summary: summary || "GitHub source record",
        status: "submitted",
        verificationStatus: "source_verified",
        verifiedAt: now,
        submittedBy: user.id,
        submittedAt: now,
        updatedAt: now,
        repositoryId: cleanText(connected.data.id, 100),
        repositoryFullName: cleanText(connected.data.fullName, 220),
        sourceMetadata: metadata,
      };
      const { error: insertError } = await serviceClient.from("docs").insert({
        path: "standaloneArtifacts/" + artifactId,
        data: artifact,
      });
      if (insertError) throw new Error(insertError.message?.includes("GitHub artifacts")
        ? "The database rejected the source record's verification metadata. Please retry."
        : "GitHub confirmed the source record, but the workspace could not save the evidence.");

      return respond(200, {
        ok: true,
        artifact,
        note: "GitHub confirmed that this commit or pull request exists in the connected public repository. This does not prove the GitHub account belongs to the Quorlyth contributor; a project manager must review it before the task can be completed.",
      });
    }

    return respond(400, { error: "Unknown GitHub workspace action." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub integration failed unexpectedly.";
    return respond(400, { error: message });
  }
});
