"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getInstructions, saveInstructions } from "../../../../lib/supabase";
import { AGENTS, isAgentId, type AgentId } from "../../../../lib/agents";
import AgentSubNav from "../../../agent-sub-nav";

export default function AgentInstructionsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const validId: AgentId | null = isAgentId(id) ? id : null;
  const agent = validId ? AGENTS[validId] : null;

  const [content, setContent] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!validId) return;
    getInstructions(validId)
      .then((row) => {
        setContent(row.content);
        setUpdatedAt(row.updated_at);
        setStatus("ready");
      })
      .catch((e) => {
        setErrorMsg(e instanceof Error ? e.message : "Unknown error");
        setStatus("error");
      });
  }, [validId]);

  async function handleSave() {
    if (!validId) return;
    setStatus("saving");
    try {
      await saveInstructions(validId, content);
      setUpdatedAt(new Date().toISOString());
      setStatus("saved");
      setTimeout(() => setStatus("ready"), 2000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  if (!agent) {
    return <div style={{ color: "var(--accent-sell)", fontSize: 13 }}>Unknown agent &quot;{id}&quot;.</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: agent.accent }}>
          {agent.label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{agent.description}</div>
      </div>

      <AgentSubNav id={validId as AgentId} active="brief" />

      <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 640 }}>
        This is {agent.label}&apos;s system prompt — its trading philosophy, what it should prioritize or
        avoid, and any lessons learned. It&apos;s read fresh on every run, so changes here take effect on
        the next scheduled run, no redeploy needed.
      </p>

      {status === "loading" ? (
        <div style={{ color: "var(--text-faint)", fontSize: 13, marginTop: 20 }}>loading...</div>
      ) : status === "error" && !content ? (
        <div style={{ color: "var(--accent-sell)", fontSize: 13, marginTop: 20 }}>
          Couldn&apos;t load instructions: {errorMsg}
        </div>
      ) : (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: 480,
              marginTop: 16,
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-hairline)",
              borderRadius: 8,
              padding: 16,
              fontSize: 13,
              lineHeight: 1.6,
              resize: "vertical",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
            <button
              onClick={handleSave}
              disabled={status === "saving"}
              style={{
                background: agent.accent,
                color: "#0a0c10",
                border: "none",
                borderRadius: 6,
                padding: "9px 18px",
                fontSize: 13,
                fontWeight: 600,
                opacity: status === "saving" ? 0.6 : 1,
              }}
            >
              {status === "saving" ? "Saving..." : status === "saved" ? "Saved ✓" : "Save changes"}
            </button>

            {status === "error" && content ? (
              <span style={{ fontSize: 12, color: "var(--accent-sell)" }}>Save failed: {errorMsg}</span>
            ) : updatedAt ? (
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                last updated {new Date(updatedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
