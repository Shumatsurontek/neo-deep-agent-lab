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
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
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
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className="w-9 h-9 rounded-xl bg-cb-yellow-muted flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-cb-yellow" />
            </div>
            Approbation requise
          </DialogTitle>
          {pendingDescription && (
            <DialogDescription className="text-sm leading-relaxed mt-2">
              {pendingDescription}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-3">
          {!editing ? (
            <pre className="text-sm text-cb-blue font-mono bg-secondary rounded-2xl border border-border px-5 py-4 max-h-52 overflow-auto leading-relaxed whitespace-pre-wrap break-all">
              {pendingQuery}
            </pre>
          ) : (
            <Textarea
              value={editedQuery}
              onChange={(e) => setEditedQuery(e.target.value)}
              className="min-h-[140px] text-sm font-mono rounded-2xl"
              autoFocus
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-xl text-cb-red border-cb-red/30 hover:bg-cb-red-muted gap-2 font-medium"
            onClick={() => decide("reject")}
          >
            <XCircle className="w-4 h-4" />
            Rejeter
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-xl text-cb-yellow border-cb-yellow/30 hover:bg-cb-yellow-muted gap-2 font-medium"
            onClick={() => {
              if (!editing) {
                setEditedQuery(pendingQuery);
                setEditing(true);
              } else {
                decide("edit");
              }
            }}
          >
            <Pencil className="w-4 h-4" />
            {editing ? "Valider" : "Modifier"}
          </Button>
          <Button
            className="h-10 rounded-xl bg-cb-green text-white hover:bg-cb-green/90 gap-2 font-medium"
            onClick={() => decide("approve")}
          >
            <Check className="w-4 h-4" />
            Approuver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
