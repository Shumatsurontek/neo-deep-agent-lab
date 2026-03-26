import { useMemo, useState } from "react";
import { useContextStore } from "../../stores/context";
import YooptaEditor, { createYooptaEditor } from "@yoopta/editor";
import Paragraph from "@yoopta/paragraph";
import { BulletedList, NumberedList } from "@yoopta/lists";
import Code from "@yoopta/code";
import { Bold, Italic, CodeMark } from "@yoopta/marks";
import { html } from "@yoopta/exports";

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
    <div className="space-y-1.5">
      <div className="border border-border rounded bg-bg-secondary p-2 max-h-32 overflow-y-auto">
        <YooptaEditor
          editor={editor}
          plugins={PLUGINS}
          marks={MARKS}
          placeholder="Add a note..."
        />
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full px-2 py-1 bg-purple/20 text-purple rounded hover:bg-purple/30 font-mono text-[10px] disabled:opacity-50"
      >
        {saving ? "saving..." : "Add Note"}
      </button>
    </div>
  );
}
