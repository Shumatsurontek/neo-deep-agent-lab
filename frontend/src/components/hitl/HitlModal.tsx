import { useState } from "react";
import { useChatStore } from "../../stores/chat";
import { useHitlStore } from "../../stores/hitl";

export function HitlModal() {
  const { pendingQuery, pendingDescription, pendingData, clearPending } = useHitlStore();
  const { resumeHitl } = useChatStore();
  const [editing, setEditing] = useState(false);
  const [editedQuery, setEditedQuery] = useState("");

  if (!pendingQuery) return null;

  const decide = (action: "approve" | "reject" | "edit") => {
    const decisions = [
      {
        action_requests: [pendingData],
        review_configs: [{ decision: action, ...(action === "edit" ? { edited_args: { query: editedQuery } } : {}) }],
      },
    ];
    resumeHitl(decisions);
    clearPending();
    setEditing(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        style={{
          background: "var(--color-bg-elevated)",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: "4px",
          width: "480px",
          maxWidth: "90vw",
          padding: "20px",
        }}
      >
        <h3 className="font-mono" style={{ fontSize: "12px", fontWeight: 400, color: "var(--color-text-bright)", letterSpacing: "0.02em", marginBottom: "8px" }}>
          Approbation requise
        </h3>

        {pendingDescription && (
          <p className="font-mono" style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginBottom: "10px", lineHeight: "160%" }}>
            {pendingDescription}
          </p>
        )}

        {!editing ? (
          <pre
            className="font-mono"
            style={{
              fontSize: "11px",
              color: "var(--color-purple)",
              background: "var(--color-bg)",
              border: "0.5px solid var(--color-border)",
              borderRadius: "2px",
              padding: "10px 12px",
              maxHeight: "180px",
              overflow: "auto",
              lineHeight: "1.5",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {pendingQuery}
          </pre>
        ) : (
          <textarea
            value={editedQuery}
            onChange={(e) => setEditedQuery(e.target.value)}
            className="font-mono"
            style={{
              width: "100%",
              height: "120px",
              fontSize: "11px",
              color: "var(--color-text)",
              background: "var(--color-bg)",
              border: "0.5px solid var(--color-border)",
              borderRadius: "2px",
              padding: "10px 12px",
              outline: "none",
              resize: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-purple)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
          />
        )}

        <div className="flex gap-2 justify-end" style={{ marginTop: "12px" }}>
          <ModalBtn color="var(--color-red)" onClick={() => decide("reject")}>
            rejeter
          </ModalBtn>
          <ModalBtn
            color="var(--color-yellow)"
            onClick={() => {
              if (!editing) {
                setEditedQuery(pendingQuery);
                setEditing(true);
              } else {
                decide("edit");
              }
            }}
          >
            {editing ? "valider" : "modifier"}
          </ModalBtn>
          <ModalBtn color="var(--color-green)" onClick={() => decide("approve")}>
            approuver
          </ModalBtn>
        </div>
      </div>
    </div>
  );
}

function ModalBtn({ color, onClick, children }: { color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="font-mono uppercase tracking-wider transition-all"
      style={{
        fontSize: "9px",
        letterSpacing: "0.08em",
        color,
        padding: "5px 14px",
        borderRadius: "2px",
        border: `0.5px solid ${color}`,
        background: "transparent",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = color; e.currentTarget.style.color = "var(--color-bg)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = color; }}
    >
      {children}
    </button>
  );
}
