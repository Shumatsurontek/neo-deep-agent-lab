import { useState } from "react";
import { useChatStore } from "../../stores/chat";
import { useHitlStore } from "../../stores/hitl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { ShieldAlert, Check, Pencil, XCircle } from "lucide-react";

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
    <Dialog open={true} onOpenChange={() => { clearPending(); setEditing(false); }}>
      <DialogContent className="sm:max-w-lg rounded border border-dashed border-border-default bg-surface-base">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 font-mono text-sm">
            <div className="w-8 h-8 rounded flex items-center justify-center bg-cb-yellow/10 border border-dashed border-cb-yellow/30">
              <ShieldAlert className="w-4 h-4 text-cb-yellow" />
            </div>
            // approbation_requise
          </DialogTitle>
          {pendingDescription && (
            <DialogDescription className="font-mono text-xs text-text-muted leading-relaxed mt-2">
              {pendingDescription}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-4">
          {!editing ? (
            <pre className="font-mono text-sm text-cb-blue bg-surface-dim rounded-lg border border-dashed border-border-default px-6 py-5 max-h-52 overflow-auto leading-relaxed whitespace-pre-wrap break-all">
              {pendingQuery}
            </pre>
          ) : (
            <textarea
              value={editedQuery}
              onChange={(e) => setEditedQuery(e.target.value)}
              className="w-full min-h-[140px] font-mono text-sm bg-surface-dim border border-dashed border-border-default rounded px-5 py-4 text-text-primary focus:border-cb-blue focus:ring-1 focus:ring-cb-blue outline-none"
              autoFocus
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            className="flex items-center gap-2 font-mono text-xs text-cb-red px-5 py-2.5 rounded-md border border-dashed border-cb-red/30 hover:bg-cb-red/10 transition-colors"
            onClick={() => decide("reject")}
          >
            <XCircle className="w-3.5 h-3.5" />
            reject()
          </button>
          <button
            className="flex items-center gap-2 font-mono text-xs text-cb-yellow px-5 py-2.5 rounded-md border border-dashed border-cb-yellow/30 hover:bg-cb-yellow/10 transition-colors"
            onClick={() => {
              if (!editing) {
                setEditedQuery(pendingQuery);
                setEditing(true);
              } else {
                decide("edit");
              }
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            {editing ? "validate()" : "edit()"}
          </button>
          <button
            className="flex items-center gap-2 font-mono text-xs text-[#0A0A0A] bg-cb-green px-5 py-2.5 rounded-md hover:bg-cb-green/90 transition-colors font-medium"
            onClick={() => decide("approve")}
          >
            <Check className="w-3.5 h-3.5" />
            approve()
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
