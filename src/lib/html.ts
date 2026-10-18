import DOMPurify from 'dompurify';
import { marked } from 'marked';

/** Markdown → sanitised HTML. Trajectory text is third-party data and the app may be served through a tunnel. */
export const md = (text: string) => DOMPurify.sanitize(marked.parse(text, { async: false }) as string, { USE_PROFILES: { html: true } });
export const safeHtml = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
