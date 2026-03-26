import { useMemo, useRef } from "react";
import YooptaEditor, { createYooptaEditor } from "@yoopta/editor";
import Paragraph from "@yoopta/paragraph";
import { HeadingOne, HeadingTwo, HeadingThree } from "@yoopta/headings";
import { BulletedList, NumberedList, TodoList } from "@yoopta/lists";
import Code from "@yoopta/code";
import Blockquote from "@yoopta/blockquote";
import Table from "@yoopta/table";
import { Bold, Italic, Underline, Strike, CodeMark } from "@yoopta/marks";
import { html } from "@yoopta/exports";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FULL_PLUGINS = [
  Paragraph,
  HeadingOne,
  HeadingTwo,
  HeadingThree,
  BulletedList,
  NumberedList,
  TodoList,
  Code,
  Blockquote,
  Table,
] as any[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COMPACT_PLUGINS = [
  Paragraph,
  BulletedList,
  NumberedList,
  Code,
] as any[];

const MARKS = [Bold, Italic, Underline, Strike, CodeMark];

interface Props {
  placeholder?: string;
  compact?: boolean;
  className?: string;
}

export function RichEditor({ placeholder = "Start typing...", compact = false, className = "" }: Props) {
  const editor = useMemo(() => createYooptaEditor(), []);
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const plugins = compact ? COMPACT_PLUGINS : FULL_PLUGINS;

  return (
    <div className={`yoopta-dark ${compact ? "max-h-48 overflow-y-auto" : "min-h-[300px]"} ${className}`}>
      <YooptaEditor
        editor={editor}
        plugins={plugins}
        marks={MARKS}
        placeholder={placeholder}
      />
    </div>
  );
}

/** Export current editor content as plain text */
export function exportAsText(editor: ReturnType<typeof createYooptaEditor>): string {
  const htmlStr = html.serialize(editor, editor.getEditorValue());
  // Strip HTML tags to get plain text
  const div = document.createElement("div");
  div.innerHTML = htmlStr;
  return div.textContent || div.innerText || "";
}

/** Export current editor content as HTML */
export function exportAsHtml(editor: ReturnType<typeof createYooptaEditor>): string {
  return html.serialize(editor, editor.getEditorValue());
}

export { createYooptaEditor };
