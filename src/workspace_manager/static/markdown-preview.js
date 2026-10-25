/* Minimal, inert Markdown presentation. Raw HTML is always escaped. */
(function (root) {
  const factory = typeof module === 'object' ? require('./vendor/markdown-it.min.js') : root.markdownit;
  const parser = factory({html: false, linkify: false, typographer: false});
  // Do not load embedded images or other resources from workspace documents.
  parser.renderer.rules.image = (tokens, index) =>
    `<span class="image-description">${parser.utils.escapeHtml(tokens[index].content || 'Image')}</span>`;
  parser.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
    const token = tokens[index], href = token.attrGet('href') || '';
    if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
      token.attrSet('target', '_blank'); token.attrSet('rel', 'noopener noreferrer');
    } else {
      token.attrs = (token.attrs || []).filter(([name]) => name !== 'href');
      token.attrSet('title', 'Browse to this reference using the file explorer');
    }
    return renderer.renderToken(tokens, index, options);
  };
  const render = text => parser.render(text);
  if (typeof module === 'object') module.exports = render;
  else root.renderMarkdownPreview = render;
})(globalThis);
