import { Fragment } from 'react';

function renderMarks(text, marks) {
  if (!marks || marks.length === 0) return text;
  return marks.reduce((acc, mark) => {
    switch (mark.type) {
      case 'bold':
        return <strong>{acc}</strong>;
      case 'italic':
        return <em>{acc}</em>;
      case 'underline':
        return <u>{acc}</u>;
      case 'strike':
        return <s>{acc}</s>;
      case 'code':
        return <code>{acc}</code>;
      case 'link': {
        const href = mark.attrs && mark.attrs.href;
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {acc}
          </a>
        );
      }
      default:
        return acc;
    }
  }, text);
}

function renderTextNode(node, key) {
  if (!node || node.type !== 'text') return null;
  const text = node.text || '';
  return <Fragment key={key}>{renderMarks(text, node.marks)}</Fragment>;
}

function renderNode(node, key) {
  if (!node || typeof node !== 'object') return null;

  switch (node.type) {
    case 'doc':
      return (
        <div key={key} className="article-body">
          {(node.content || []).map((child, i) => renderNode(child, i))}
        </div>
      );
    case 'paragraph':
      return (
        <p key={key}>
          {(node.content || []).map((child, i) => renderNode(child, i))}
          {(!node.content || node.content.length === 0) && <br />}
        </p>
      );
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs && node.attrs.level) || 2, 1), 6);
      const Tag = `h${level}`;
      return (
        <Tag key={key}>
          {(node.content || []).map((child, i) => renderNode(child, i))}
        </Tag>
      );
    }
    case 'bulletList':
      return (
        <ul key={key}>
          {(node.content || []).map((child, i) => renderNode(child, i))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key}>
          {(node.content || []).map((child, i) => renderNode(child, i))}
        </ol>
      );
    case 'listItem':
      return (
        <li key={key}>
          {(node.content || []).map((child, i) => renderNode(child, i))}
        </li>
      );
    case 'blockquote':
      return (
        <blockquote key={key}>
          {(node.content || []).map((child, i) => renderNode(child, i))}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{(node.content || []).map((c) => c.text || '').join('')}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} />;
    case 'hardBreak':
      return <br key={key} />;
    case 'video': {
      const src = node.attrs && node.attrs.src;
      if (!src) return null;
      const alt = (node.attrs && node.attrs.alt) || '';
      return (
        <figure key={key} className="article-video">
          <video src={src} controls preload="metadata" playsInline>
            Your browser does not support the video tag.
          </video>
          {alt ? <figcaption>{alt}</figcaption> : null}
        </figure>
      );
    }
    case 'image': {
      const src = node.attrs && node.attrs.src;
      if (!src) return null;
      const alt = (node.attrs && node.attrs.alt) || '';
      const width = node.attrs && node.attrs.width;
      const height = node.attrs && node.attrs.height;
      return (
        <figure key={key} className="article-image">
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            loading="lazy"
            decoding="async"
          />
          {alt ? <figcaption>{alt}</figcaption> : null}
        </figure>
      );
    }
    case 'text':
      return renderTextNode(node, key);
    default:
      // Gracefully skip unsupported nodes but render their children if any.
      if (Array.isArray(node.content)) {
        return (
          <Fragment key={key}>
            {node.content.map((child, i) => renderNode(child, i))}
          </Fragment>
        );
      }
      return null;
  }
}

export default function TipTapRenderer({ content }) {
  if (!content || typeof content !== 'object') {
    return <p className="muted">No content available.</p>;
  }
  if (content.type !== 'doc') {
    return <p className="muted">Unsupported content format.</p>;
  }
  return renderNode(content, 'root');
}