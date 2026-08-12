const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #16202c; margin: 0; padding: 32px; background: #fff; }
  header.doc { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 3px solid #0f2f45; padding-bottom: 12px; margin-bottom: 20px; }
  header.doc h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
  header.doc .brand { font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: #14808c; font-weight: 700; }
  header.doc .meta { font-size: 11px; color: #5b6b7b; text-align: right; line-height: 1.6; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #0f2f45; margin: 22px 0 8px; }
  p, li, td, th { font-size: 12px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { text-align: left; background: #eef4f7; border: 1px solid #cdd9e1; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #3d515f; }
  td { border: 1px solid #cdd9e1; padding: 6px 8px; vertical-align: top; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #5b6b7b; }
  .box { border: 1px solid #cdd9e1; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
  .lines div { border-bottom: 1px solid #b9c7d2; height: 22px; }
  .bubbles span { display: inline-block; width: 18px; height: 18px; border: 1px solid #55697a; border-radius: 50%; margin-right: 8px; text-align: center; font-size: 10px; line-height: 17px; color: #55697a; }
  .sign { display: flex; gap: 28px; margin-top: 28px; }
  .sign div { flex: 1; border-top: 1px solid #55697a; padding-top: 6px; font-size: 10px; color: #5b6b7b; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  footer.doc { margin-top: 24px; border-top: 1px solid #cdd9e1; padding-top: 8px; font-size: 10px; color: #7a8a99; }
  @page { margin: 16mm; }
  @media print { body { padding: 0; } .noprint { display: none !important; } }
`;

export function buildDocument(title: string, bodyHtml: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title><style>${BASE_CSS}</style></head>
<body>${bodyHtml}<footer class="doc">Meraki Education · generated ${new Date().toLocaleString("en-US")}</footer></body></html>`;
}

export function docHeader(title: string, metaLines: string[]) {
  return `<header class="doc"><div><div class="brand">Meraki Education</div><h1>${escapeHtml(title)}</h1></div>
<div class="meta">${metaLines.map(escapeHtml).join("<br />")}</div></header>`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  if (frame.contentWindow?.document.readyState === "complete") run();
  else frame.onload = run;
}

export function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "document"
  );
}
