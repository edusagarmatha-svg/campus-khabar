import { forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

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

const TipTapEditor = forwardRef(function TipTapEditor({ content, onChange }, ref) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      MediaImage,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write your content…' }),
    ],
    content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  useImperativeHandle(ref, () => ({
    insertImage(media) {
      editor?.chain().focus().setImage({
        src: media.file_url,
        alt: media.alt_text || media.file_name,
        mediaId: media.id,
      }).run();
    },
  }), [editor]);

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()}>Bold</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}>Italic</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}>List</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
});

export default TipTapEditor;
EOF