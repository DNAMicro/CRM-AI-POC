"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { FormattingToolbar } from "./FormattingToolbar";

interface RichTextEditorProps {
  initialContent?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  showToolbar?: boolean;
  disabled?: boolean;
  className?: string;
}

export function RichTextEditor({
  initialContent = "",
  onChange,
  placeholder = "Write something...",
  showToolbar = true,
  disabled = false,
  className = "",
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // StarterKit v3 bundles Link and Underline; configure them here
      // rather than registering duplicates
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          HTMLAttributes: {
            class: "text-indigo-600 underline",
          },
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: initialContent,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "outline-none min-h-[120px] px-3 py-2.5 text-[13px] leading-relaxed text-foreground/80 prose prose-sm max-w-none [&_a]:text-indigo-600 [&_a]:underline [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:text-foreground/60 [&_p]:my-1",
      },
    },
  });

  if (!editor) return null;

  return (
    <div
      className={`bg-background/80 border border-border/80 rounded-xl overflow-hidden transition-all focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 ${disabled ? "opacity-50" : ""} ${className}`}
    >
      {showToolbar && <FormattingToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
