import { useEffect, useRef, useState } from "react";
import type { ToolStep as ToolStepType } from "../../types";

export function ToolStep({ tool }: { tool: ToolStepType }): React.ReactElement {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const prevStatus = useRef(tool.status);

  useEffect(() => {
    if (prevStatus.current !== "running" && tool.status === "running") {
      setOpen(true);
    }
    prevStatus.current = tool.status;
  }, [tool.status]);

  const isRunning = tool.status === "running";
  const isError = tool.status === "error";

  const inputDisplay = formatInput(tool.input);
  const parsed = !isRunning ? parseTableData(tool.output) : null;
  const badge = getBadge(tool.output, parsed);

  function handleCopy(): void {
    if (!tool.output) return;
    navigator.clipboard.writeText(tool.output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  function handleDownloadCSV(): void {
    if (!tool.output) return;
    let csv: string;
    if (parsed) {
      const esc = (v: string): string => '"' + String(v).replace(/"/g, '""') + '"';
      csv = parsed.headers.map(esc).join(",") + "\n" +
        parsed.rows.map((r: string[]) => r.map((c: string) => esc(c || "")).join(",")).join("\n");
    } else {
      csv = tool.output;
    }
    downloadFile(csv, getFilename(tool.input, "csv"), "text/csv");
  }

  function handleDownloadJSON(): void {
    if (!tool.output) return;
    let json: string;
    if (parsed) {
      json = JSON.stringify(
        parsed.rows.map((r: string[]) => {
          const o: Record<string, string | null> = {};
          parsed.headers.forEach((h: string, i: number) => { o[h] = r[i] || null; });
          return o;
        }), null, 2,
      );
    } else {
      json = JSON.stringify({ result: tool.output }, null, 2);
    }
    downloadFile(json, getFilename(tool.input, "json"), "application/json");
  }

  const accentColor = isRunning ? "var(--color-yellow)" : isError ? "var(--color-red)" : "var(--color-green)";

  return (
    <div className="my-2 animate-fade-in" style={{ borderLeft: `1.5px solid ${accentColor}`, paddingLeft: "10px" }}>
      {/* Summary row */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 py-1 text-left group"
      >
        <span
          className="text-[9px] transition-transform"
          style={{ color: "var(--color-text-secondary)", transform: open ? "rotate(90deg)" : "none" }}
        >
          &#x25B8;
        </span>

        {isRunning && (
          <svg className="w-2.5 h-2.5 shrink-0 animate-spin" style={{ color: accentColor }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        )}

        <span
          className="font-mono uppercase tracking-widest"
          style={{ fontSize: "9px", fontWeight: 400, letterSpacing: "0.12em", color: accentColor }}
        >
          {tool.name}
        </span>

        {badge && (
          <span className="ml-auto font-mono" style={{ fontSize: "9px", color: "var(--color-text-secondary)" }}>
            {badge}
          </span>
        )}
      </button>

      {/* Body */}
      {open && (
        <div className="pb-1 space-y-1.5" style={{ marginTop: "2px" }}>
          {inputDisplay && (
            <div>
              <div className="font-mono uppercase tracking-widest" style={{ fontSize: "8px", color: "var(--color-text-secondary)", letterSpacing: "0.15em", marginBottom: "3px" }}>
                input
              </div>
              <pre
                className="font-mono whitespace-pre-wrap break-all"
                style={{
                  fontSize: "11px",
                  color: "var(--color-purple)",
                  background: "var(--color-bg)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: "2px",
                  padding: "6px 8px",
                  lineHeight: "1.5",
                }}
              >
                {inputDisplay}
              </pre>
            </div>
          )}

          {tool.output && (
            <div>
              <div className="font-mono uppercase tracking-widest" style={{ fontSize: "8px", color: "var(--color-text-secondary)", letterSpacing: "0.15em", marginBottom: "3px" }}>
                output
              </div>

              {parsed ? (
                <div className="overflow-auto" style={{ maxHeight: "240px", border: "0.5px solid var(--color-border)", borderRadius: "2px" }}>
                  <table className="w-full border-collapse font-mono" style={{ fontSize: "10px" }}>
                    <thead>
                      <tr>
                        {parsed.headers.map((h, i) => (
                          <th
                            key={i}
                            className="font-mono text-left font-normal sticky top-0"
                            style={{
                              fontSize: "9px",
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              color: "var(--color-text-secondary)",
                              background: "var(--color-bg-secondary)",
                              padding: "4px 8px",
                              borderBottom: "0.5px solid var(--color-border)",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-purple/[0.03]">
                          {parsed.headers.map((_, ci) => {
                            const cell = row[ci] || "";
                            const display = cell.length > 100 ? cell.slice(0, 100) + "\u2026" : cell;
                            return (
                              <td
                                key={ci}
                                title={cell}
                                className="font-mono overflow-hidden text-ellipsis whitespace-nowrap"
                                style={{
                                  padding: "3px 8px",
                                  color: "var(--color-text)",
                                  borderBottom: "0.5px solid var(--color-border)",
                                  maxWidth: "220px",
                                  fontSize: "10px",
                                }}
                              >
                                {display}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : tool.output.includes("/download/") ? (
                <DownloadLink output={tool.output} />
              ) : (
                <pre
                  className="font-mono whitespace-pre-wrap break-all overflow-y-auto"
                  style={{
                    fontSize: "11px",
                    color: isError ? "var(--color-red)" : "var(--color-text)",
                    background: "var(--color-bg)",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: "2px",
                    padding: "6px 8px",
                    lineHeight: "1.5",
                    maxHeight: "200px",
                  }}
                >
                  {tool.output.length > 3000 ? tool.output.slice(0, 3000) + "\n\u2026" : tool.output}
                </pre>
              )}

              {/* Action buttons */}
              <div className="flex gap-1" style={{ marginTop: "4px" }}>
                <ActionBtn onClick={handleCopy}>{copied ? "copied" : "copy"}</ActionBtn>
                <ActionBtn onClick={handleDownloadCSV}>csv</ActionBtn>
                <ActionBtn onClick={handleDownloadJSON}>json</ActionBtn>
              </div>
            </div>
          )}

          {isRunning && !tool.output && (
            <div className="font-mono italic" style={{ fontSize: "9px", color: "var(--color-yellow)", opacity: 0.6 }}>
              executing...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="font-mono uppercase tracking-wider transition-all"
      style={{
        fontSize: "8px",
        letterSpacing: "0.1em",
        color: "var(--color-text-secondary)",
        padding: "2px 6px",
        border: "0.5px solid var(--color-border)",
        borderRadius: "2px",
        background: "transparent",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text-bright)"; e.currentTarget.style.borderColor = "var(--color-border-secondary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-secondary)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
    >
      {children}
    </button>
  );
}

function DownloadLink({ output }: { output: string }): React.ReactElement {
  const match = output.match(/\/download\/([a-f0-9-]+)\/([^\s]+)/);
  if (!match) {
    return (
      <pre className="font-mono" style={{ fontSize: "11px", color: "var(--color-text)", background: "var(--color-bg)", border: "0.5px solid var(--color-border)", borderRadius: "2px", padding: "6px 8px" }}>
        {output}
      </pre>
    );
  }

  const url = `/download/${match[1]}/${match[2]}`;
  const filename = match[2] || "file";
  const isImage = /\.(png|jpg|jpeg|svg)$/i.test(filename);

  return (
    <div className="space-y-1.5">
      {isImage && (
        <img
          src={url}
          alt={filename}
          className="max-w-full rounded"
          style={{ border: "0.5px solid var(--color-border)" }}
        />
      )}
      <a
        href={url}
        download
        className="inline-flex items-center gap-1.5 font-mono no-underline transition-all"
        style={{
          fontSize: "10px",
          color: "var(--color-text-bright)",
          padding: "4px 10px",
          border: "0.5px solid var(--color-border)",
          borderRadius: "2px",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {filename}
      </a>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────── */

interface ParsedTable { headers: string[]; rows: string[][]; }

function formatInput(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === "object" && obj !== null) {
      return obj.query || obj.table_name || JSON.stringify(obj, null, 2);
    }
  } catch { /* not JSON */ }
  return raw;
}

function getBadge(output: string | undefined, parsed: ParsedTable | null): string | null {
  if (!output) return null;
  if (parsed) return `${parsed.rows.length} row${parsed.rows.length !== 1 ? "s" : ""}`;
  return `${output.length} B`;
}

function parseTableData(text: string | undefined): ParsedTable | null {
  if (!text || typeof text !== "string") return null;
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;
  if (lines[0]!.includes("|")) {
    const parseRow = (r: string): string[] => r.split("|").map((c) => c.trim()).filter((c) => c !== "");
    const headers = parseRow(lines[0]!);
    if (!headers.length) return null;
    let start = 1;
    if (lines[1] && /^[\s|+\-:=]+$/.test(lines[1])) start = 2;
    const rows: string[][] = [];
    for (let i = start; i < lines.length; i++) {
      if (/^[\s|+\-:=]+$/.test(lines[i]!)) continue;
      if (/^\*?\(?\d+ (?:total )?rows?\)?/.test(lines[i]!.trim())) continue;
      const cells = parseRow(lines[i]!);
      if (cells.length) rows.push(cells);
    }
    return rows.length ? { headers, rows } : null;
  }
  if (lines[0]!.includes(",") && lines[0]!.split(",").length >= 2) {
    const headers = lines[0]!.split(",").map((c) => c.trim());
    const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim())).filter((r) => r.length);
    return rows.length ? { headers, rows } : null;
  }
  return null;
}

function getFilename(input: string | undefined, ext: string): string {
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  let name = "result";
  if (input) {
    try {
      const obj = JSON.parse(input);
      if (obj.table_name) name = obj.table_name;
      else if (obj.query) { const m = obj.query.match(/(?:FROM|JOIN)\s+(\w+)/i); if (m) name = m[1]; }
    } catch { /* ignore */ }
  }
  return `${name}_${ts}.${ext}`;
}

function downloadFile(content: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
