import { useMemo, useState } from "react";
import { useContextStore } from "../../stores/context";
import YooptaEditor, { createYooptaEditor } from "@yoopta/editor";
import Paragraph from "@yoopta/paragraph";
import { BulletedList, NumberedList } from "@yoopta/lists";
import Code from "@yoopta/code";
import { Bold, Italic, CodeMark } from "@yoopta/marks";
import { html } from "@yoopta/exports";
import { Button } from "../ui/button";
import { Plus, Loader2 } from "lucide-react";

const PLUGINS = [Paragraph, BulletedList, NumberedList, Code];
const MARKS = [Bold, Italic, CodeMark];

export function ScratchpadEditor() {
  const { addUserContext } = useContextStore();
  const [saving, setSaving] = useState(false);
  const editor = useMemo(() => createYooptaEditor(), []);

  const handleSave = async () => {
    const htmlStr = html.serialize(editor, editor.getEditorValue());
    const div = document.createElement("div");
    div.innerHTML = htmlStr;
    const text = div.textContent || div.innerText || "";
    if (!text.trim()) return;

    setSaving(true);
    try {
      await addUserContext(text.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 mt-3">
      <div className="border border-border rounded-xl bg-secondary/30 p-3 max-h-36 overflow-y-auto">
        <YooptaEditor
          editor={editor}
          plugins={PLUGINS}
          marks={MARKS}
          placeholder="Add a note..."
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full h-9 text-xs gap-2 rounded-xl font-medium"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {saving ? "Saving..." : "Add Note"}
      </Button>
    </div>
  );
}
