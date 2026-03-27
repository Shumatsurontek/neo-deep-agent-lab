import { useEffect, useRef, useState } from "react";
import type { ToolStep as ToolStepType } from "../../types";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { ChevronRight, Copy, Download, Loader2 } from "lucide-react";

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

  const statusColor = isRunning
    ? "text-cb-yellow border-cb-yellow/20 bg-cb-yellow-muted"
    : isError
    ? "text-cb-red border-cb-red/20 bg-cb-red-muted"
    : "text-cb-green border-cb-green/20 bg-cb-green-muted";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-2xl border border-border bg-surface overflow-hidden animate-fade-in">
        {/* Summary row */}
        <CollapsibleTrigger className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors cursor-pointer">
          <ChevronRight
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />

          {isRunning && (
            <Loader2 className="w-4 h-4 text-cb-yellow animate-spin" />
          )}

          <Badge variant="outline" className={`text-[11px] h-6 px-2.5 uppercase tracking-wider font-semibold rounded-lg ${statusColor}`}>
            {tool.name}
          </Badge>

          {badge && (
            <span className="ml-auto text-xs text-muted-foreground font-medium">
              {badge}
            </span>
          )}
        </CollapsibleTrigger>

        {/* Body */}
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3 border-t border-border">
            {inputDisplay && (
              <div className="pt-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-widest mb-2 font-semibold">
                  Input
                </div>
                <pre className="text-[13px] text-cb-blue whitespace-pre-wrap break-all bg-background rounded-xl border border-border px-4 py-3 leading-relaxed font-mono">
                  {inputDisplay}
                </pre>
              </div>
            )}

            {tool.output && (
              <div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-widest mb-2 font-semibold">
                  Output
                </div>

                {parsed ? (
                  <div className="overflow-auto max-h-64 rounded-xl border border-border">
                    <table className="w-full border-collapse text-[13px]">
                      <thead>
                        <tr>
                          {parsed.headers.map((h, i) => (
                            <th
                              key={i}
                              className="text-left text-[11px] uppercase tracking-wider font-semibold text-muted-foreground bg-secondary sticky top-0 px-4 py-2.5 border-b border-border"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.rows.map((row, ri) => (
                          <tr key={ri} className="hover:bg-secondary/30 transition-colors">
                            {parsed.headers.map((_, ci) => {
                              const cell = row[ci] || "";
                              const display = cell.length > 100 ? cell.slice(0, 100) + "\u2026" : cell;
                              return (
                                <td
                                  key={ci}
                                  title={cell}
                                  className="px-4 py-2 border-b border-border text-foreground/70 max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap"
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
                    className={`text-[13px] font-mono whitespace-pre-wrap break-all overflow-y-auto max-h-52 bg-background rounded-xl border border-border px-4 py-3 leading-relaxed ${
                      isError ? "text-cb-red" : "text-foreground/70"
                    }`}
                  >
                    {tool.output.length > 3000 ? tool.output.slice(0, 3000) + "\n\u2026" : tool.output}
                  </pre>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1.5 rounded-xl" onClick={handleCopy}>
                    <Copy className="w-3.5 h-3.5" />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1.5 rounded-xl" onClick={handleDownloadCSV}>
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1.5 rounded-xl" onClick={handleDownloadJSON}>
                    <Download className="w-3.5 h-3.5" />
                    JSON
                  </Button>
                </div>
              </div>
            )}

            {isRunning && !tool.output && (
              <div className="text-sm text-cb-yellow/60 italic pt-3">
                executing...
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function DownloadLink({ output }: { output: string }): React.ReactElement {
  const match = output.match(/\/download\/([a-f0-9-]+)\/([^\s]+)/);
  if (!match) {
    return (
      <pre className="text-[13px] font-mono text-foreground/70 bg-background border border-border rounded-xl px-4 py-3">
        {output}
      </pre>
    );
  }

  const url = `/download/${match[1]}/${match[2]}`;
  const filename = match[2] || "file";
  const isImage = /\.(png|jpg|jpeg|svg)$/i.test(filename);

  return (
    <div className="space-y-3">
      {isImage && (
        <img
          src={url}
          alt={filename}
          className="max-w-full rounded-xl border border-border"
        />
      )}
      <a
        href={url}
        download
        className="inline-flex items-center gap-2 text-sm text-foreground font-medium px-4 py-2.5 border border-border rounded-xl hover:bg-secondary/50 transition-colors no-underline"
      >
        <Download className="w-4 h-4" />
        {filename}
      </a>
    </div>
  );
}

/* -- Helpers -- */

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
