import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Node } from '@tiptap/core';

const MediaImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-media-id'),
        renderHTML: (attributes) => {
          if (!attributes.mediaId) return {};
          return { 'data-media-id': attributes.mediaId };
        },
      },
    };
  },
});

const MediaVideo = Node.create({
  name: 'video',
  group: 'block',
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      mediaId: { default: null },
      alt: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'video[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['video', { controls: true, preload: 'metadata', ...HTMLAttributes }];
  },
  addCommands() {
    return {
      setVideo: (options) => ({ commands }) => {
        return commands.insertContent({ type: this.name, attrs: options });
      },
    };
  },
});

const TipTapEditor = forwardRef(function TipTapEditor({ content, onChange, editable = true }, ref) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      MediaImage,
      MediaVideo,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write your content…' }),
    ],
    content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  useEffect(() => {
    editor?.setEditable(editable !== false);
  }, [editor, editable]);

  useImperativeHandle(ref, () => ({
    insertImage(media) {
      editor?.chain().focus().setImage({
        src: media.file_url,
        alt: media.alt_text || media.file_name,
        mediaId: media.id,
      }).run();
    },
    insertVideo(media) {
      editor?.chain().focus().setVideo({
        src: media.file_url,
        alt: media.alt_text || media.file_name,
        mediaId: media.id,
      }).run();
    },
  }), [editor]);

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <button type="button" disabled={!editable} onClick={() => editor?.chain().focus().toggleBold().run()}>Bold</button>
        <button type="button" disabled={!editable} onClick={() => editor?.chain().focus().toggleItalic().run()}>Italic</button>
        <button type="button" disabled={!editable} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" disabled={!editable} onClick={() => editor?.chain().focus().toggleBulletList().run()}>List</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
});

export default TipTapEditor;
