import { useEffect, useState } from "react";
import { useFineTuneStore } from "../../stores/finetune";
import { ScrollArea } from "../ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import {
  Cpu,
  Play,
  Square,
  ChevronRight,
  Database,
  Zap,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Server,
  Send,
  Eye,
  EyeOff,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const MODELS = [
  { id: "Qwen/Qwen3.5-0.8B", label: "Qwen 3.5 — 0.8B", vram: "3 GB", engine: "Unsloth" },
  { id: "Qwen/Qwen3.5-2B", label: "Qwen 3.5 — 2B", vram: "5 GB", engine: "Unsloth" },
  { id: "Qwen/Qwen3.5-4B", label: "Qwen 3.5 — 4B", vram: "10 GB", engine: "Unsloth" },
  { id: "Qwen/Qwen3.5-9B", label: "Qwen 3.5 — 9B", vram: "22 GB", engine: "Unsloth" },
  { id: "LiquidAI/LFM2.5-350M", label: "LFM 2.5 — 350M", vram: "<1 GB", engine: "Transformers" },
];

const GPUS = [
  { id: "L40S", label: "L40S", desc: "48 GB" },
  { id: "A100-80GB", label: "A100", desc: "80 GB" },
  { id: "T4", label: "T4", desc: "16 GB" },
];

export function FineTunePanel() {
  const {
    config, updateConfig,
    isTraining, activeJob, events, lossHistory, jobs,
    startJob, cancelJob, loadJobs, clearEvents,
    trainedModels, servingUrl, isServing, inferMessages, isInferring,
    loadModels, deployModel, sendInference,
  } = useFineTuneStore();

  const [inferInput, setInferInput] = useState("");
  const [showWandbKey, setShowWandbKey] = useState(false);

  useEffect(() => {
    loadJobs();
    loadModels();
  }, [loadJobs, loadModels]);

  const progressPct = activeJob?.total_steps
    ? Math.round((activeJob.current_step / activeJob.total_steps) * 100)
    : 0;

  const lastEvent = events.at(-1);

  const handleInfer = () => {
    const text = inferInput.trim();
    if (!text || isInferring) return;
    setInferInput("");
    sendInference(text);
  };

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <ScrollArea className="flex-1">
        <div className="px-8 lg:px-12 py-8 max-w-4xl mx-auto space-y-6">

          {/* ── Section 1: Config Form ── */}
          <div className="rounded-lg border border-dashed border-border-default bg-surface-base p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cb-blue/10 border border-dashed border-cb-blue/20">
                <Cpu className="w-4 h-4 text-cb-blue" />
              </div>
              <div>
                <h2 className="font-mono text-sm text-text-primary font-medium">// model_config</h2>
                <p className="font-mono text-[11px] text-text-dim mt-0.5">LoRA bf16 fine-tuning via Modal + Unsloth</p>
              </div>
            </div>

            {/* Model selector */}
            <div>
              <label className="font-mono text-[11px] text-text-dim uppercase tracking-widest mb-2.5 block">model</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => updateConfig({ model: m.id })}
                    disabled={isTraining}
                    className={`text-left font-mono text-xs p-3.5 rounded-lg border border-dashed transition-all ${
                      config.model === m.id
                        ? "border-cb-blue/40 bg-cb-blue/5 text-cb-blue"
                        : "border-border-default text-text-muted hover:border-cb-blue/20 hover:text-text-secondary"
                    } disabled:opacity-50`}
                  >
                    <div className="font-medium">{m.label}</div>
                    <div className="flex gap-3 text-[10px] text-text-dim mt-1">
                      <span>VRAM: {m.vram}</span>
                      <span className="text-cb-blue/60">{m.engine}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Dataset */}
            <div>
              <label className="font-mono text-[11px] text-text-dim uppercase tracking-widest mb-2.5 block">dataset</label>
              <div className="flex items-center gap-3 p-3.5 rounded-lg border border-dashed border-border-default bg-surface-dim">
                <Database className="w-4 h-4 text-cb-blue shrink-0" />
                <span className="font-mono text-xs text-text-secondary">gretelai/synthetic_text_to_sql</span>
                <span className="font-mono text-[10px] text-text-dim ml-auto">105,851 records</span>
              </div>
            </div>

            {/* GPU selector */}
            <div>
              <label className="font-mono text-[11px] text-text-dim uppercase tracking-widest mb-2.5 block">gpu</label>
              <div className="flex gap-2">
                {GPUS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => updateConfig({ gpu: g.id })}
                    disabled={isTraining}
                    className={`flex-1 font-mono text-xs text-center p-3 rounded-lg border border-dashed transition-all ${
                      config.gpu === g.id
                        ? "border-cb-blue/40 bg-cb-blue/5 text-cb-blue"
                        : "border-border-default text-text-muted hover:border-cb-blue/20"
                    } disabled:opacity-50`}
                  >
                    <div className="font-medium">{g.label}</div>
                    <div className="text-[10px] text-text-dim mt-1">{g.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Hyperparameters */}
            <div>
              <label className="font-mono text-[11px] text-text-dim uppercase tracking-widest mb-2.5 block">// hyperparameters</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {([
                  { key: "num_epochs", label: "epochs", step: 1 },
                  { key: "learning_rate", label: "lr", step: 0.0001 },
                  { key: "batch_size", label: "batch", step: 1 },
                  { key: "max_seq_length", label: "seq_len", step: 256 },
                  { key: "lora_r", label: "lora_r", step: 4 },
                  { key: "lora_alpha", label: "lora_alpha", step: 4 },
                  { key: "dataset_max_samples", label: "max_samples", step: 1000 },
                ] as const).map((param) => (
                  <div key={param.key}>
                    <label className="font-mono text-[10px] text-text-dim block mb-1.5">{param.label}</label>
                    <input
                      type="number"
                      step={param.step}
                      value={config[param.key]}
                      onChange={(e) => updateConfig({ [param.key]: Number(e.target.value) })}
                      disabled={isTraining}
                      className="w-full h-9 font-mono text-xs bg-surface-dim border border-dashed border-border-default rounded-md px-3 text-text-primary placeholder:text-text-dim focus:border-cb-blue focus:ring-1 focus:ring-cb-blue outline-none disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* W&B API Key */}
            <div>
              <label className="font-mono text-[11px] text-text-dim uppercase tracking-widest mb-2.5 block">// wandb (optional)</label>
              <div className="relative">
                <input
                  type={showWandbKey ? "text" : "password"}
                  value={config.wandb_api_key}
                  onChange={(e) => updateConfig({ wandb_api_key: e.target.value })}
                  placeholder="wandb_api_key..."
                  disabled={isTraining}
                  className="w-full h-9 font-mono text-xs bg-surface-dim border border-dashed border-border-default rounded-md px-3 pr-10 text-text-primary placeholder:text-text-dim focus:border-cb-blue focus:ring-1 focus:ring-cb-blue outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowWandbKey(!showWandbKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-muted transition-colors"
                >
                  {showWandbKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="font-mono text-[10px] text-text-dim mt-1.5">
                {config.wandb_api_key ? "W&B logging enabled" : "Leave empty to disable W&B logging"}
              </p>
            </div>

            {/* Action button */}
            <div className="flex items-center gap-3 pt-2">
              {!isTraining ? (
                <button
                  onClick={startJob}
                  className="flex items-center gap-2.5 font-mono text-xs text-surface-dim bg-cb-blue px-6 py-3 rounded-lg hover:bg-cb-blue-hover transition-colors font-medium"
                >
                  <Play className="w-4 h-4" />
                  train()
                </button>
              ) : (
                <button
                  onClick={() => activeJob && cancelJob(activeJob.id)}
                  className="flex items-center gap-2.5 font-mono text-xs text-cb-red px-6 py-3 rounded-lg border border-dashed border-cb-red/30 hover:bg-cb-red/10 transition-colors"
                >
                  <Square className="w-4 h-4" />
                  cancel()
                </button>
              )}
              {events.length > 0 && !isTraining && (
                <button onClick={clearEvents} className="font-mono text-[11px] text-text-dim hover:text-text-muted transition-colors">
                  clear_logs()
                </button>
              )}
            </div>
          </div>

          {/* ── Section 2: Training Monitor ── */}
          {(isTraining || events.length > 0) && (
            <div className="rounded-lg border border-dashed border-border-default bg-surface-base p-6 space-y-5">
              <div className="flex items-center gap-3">
                <Zap className="w-4 h-4 text-cb-yellow" />
                <h2 className="font-mono text-sm text-text-primary font-medium">// training_monitor</h2>
                {isTraining && <Loader2 className="w-4 h-4 text-cb-yellow animate-spin ml-auto" />}
              </div>

              {activeJob && activeJob.total_steps > 0 && (
                <div>
                  <div className="flex justify-between font-mono text-[11px] text-text-muted mb-2">
                    <span>step {activeJob.current_step} / {activeJob.total_steps}</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-dim overflow-hidden">
                    <div className="h-full rounded-full bg-cb-blue transition-all duration-300" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {activeJob?.current_loss != null && (
                  <span className="font-mono text-[11px] px-2.5 py-1 rounded-md border border-dashed border-border-default text-text-muted">
                    loss <span className="text-cb-blue">{activeJob.current_loss.toFixed(4)}</span>
                  </span>
                )}
                {lastEvent?.learning_rate != null && (
                  <span className="font-mono text-[11px] px-2.5 py-1 rounded-md border border-dashed border-border-default text-text-muted">
                    lr <span className="text-cb-cyan">{lastEvent.learning_rate.toExponential(2)}</span>
                  </span>
                )}
                {lastEvent?.epoch != null && (
                  <span className="font-mono text-[11px] px-2.5 py-1 rounded-md border border-dashed border-border-default text-text-muted">
                    epoch <span className="text-cb-green">{lastEvent.epoch}</span>
                  </span>
                )}
                {lastEvent?.message && (
                  <span className="font-mono text-[11px] text-text-dim">{lastEvent.message}</span>
                )}
              </div>

              {lossHistory.length > 1 && (
                <div className="h-48 rounded-lg border border-dashed border-border-default bg-surface-dim p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lossHistory}>
                      <XAxis dataKey="step" tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "#1E1E1E" }} tickLine={false} />
                      <YAxis tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "#1E1E1E" }} tickLine={false} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "#111", border: "1px dashed #1E1E1E", borderRadius: "8px", fontFamily: "JetBrains Mono", fontSize: "11px", color: "#E0E0E0" }} labelFormatter={(v) => `step ${v}`} />
                      <Line type="monotone" dataKey="loss" stroke="#00FF88" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: "#00FF88" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {events.length > 0 && (
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {events.map((evt, i) => (
                    <div key={i} className="flex items-start gap-2 font-mono text-[11px]">
                      <span className={`shrink-0 ${eventColor(evt.type)}`}>[{evt.type.replace("finetune-", "")}]</span>
                      <span className="text-text-dim">{evt.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Section 3: Inference ── */}
          <div className="rounded-lg border border-dashed border-border-default bg-surface-base p-6 space-y-5">
            <div className="flex items-center gap-3">
              <Server className="w-4 h-4 text-cb-cyan" />
              <h2 className="font-mono text-sm text-text-primary font-medium">// inference</h2>
              {servingUrl && (
                <span className="ml-auto font-mono text-[10px] text-cb-green">serving</span>
              )}
            </div>

            {/* Trained models list */}
            {trainedModels.length > 0 && (
              <div>
                <label className="font-mono text-[11px] text-text-dim uppercase tracking-widest mb-2.5 block">available models</label>
                <div className="space-y-1.5">
                  {trainedModels.map((m) => (
                    <div key={m.name} className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg border border-dashed border-border-default bg-surface-dim">
                      <CheckCircle2 className="w-3.5 h-3.5 text-cb-green shrink-0" />
                      <span className="font-mono text-xs text-text-secondary flex-1 truncate">{m.name}</span>
                      <span className="font-mono text-[10px] text-text-dim">{m.size_mb} MB</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {trainedModels.length === 0 && (
              <p className="font-mono text-xs text-text-dim">// no trained models yet — train one first</p>
            )}

            {/* Deploy button */}
            {trainedModels.length > 0 && (
              <button
                onClick={deployModel}
                disabled={isServing}
                className={`flex items-center gap-2.5 font-mono text-xs px-5 py-2.5 rounded-lg border border-dashed transition-colors ${
                  servingUrl
                    ? "border-cb-green/30 text-cb-green bg-cb-green/5"
                    : "border-cb-cyan/30 text-cb-cyan hover:bg-cb-cyan/5"
                } disabled:opacity-50`}
              >
                {isServing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                {servingUrl ? "serving()" : "deploy()"}
              </button>
            )}

            {servingUrl && (
              <div className="font-mono text-[11px] text-text-dim px-3.5 py-2.5 rounded-lg border border-dashed border-border-default bg-surface-dim break-all">
                endpoint: <span className="text-cb-cyan">{servingUrl}</span>
              </div>
            )}

            {/* Chat interface */}
            {servingUrl && (
              <div className="space-y-3">
                <label className="font-mono text-[11px] text-text-dim uppercase tracking-widest block">// query</label>

                {inferMessages.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {inferMessages.map((msg, i) => (
                      <div key={i} className={`font-mono text-xs p-3.5 rounded-lg border border-dashed ${
                        msg.role === "user"
                          ? "border-cb-blue/20 bg-cb-blue/5 text-text-primary"
                          : "border-border-default bg-surface-dim text-text-secondary"
                      }`}>
                        <span className="text-[10px] text-text-dim block mb-1">{msg.role === "user" ? "> user" : "< assistant"}</span>
                        <pre className="whitespace-pre-wrap break-words">{msg.content}</pre>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <textarea
                    value={inferInput}
                    onChange={(e) => setInferInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleInfer();
                      }
                    }}
                    placeholder="Schema: ...\nQuestion: ..."
                    rows={2}
                    className="w-full resize-none font-mono text-xs bg-surface-dim border border-dashed border-border-default rounded-lg px-4 pr-12 py-3 text-text-primary placeholder:text-text-dim focus:border-cb-blue focus:ring-1 focus:ring-cb-blue outline-none"
                  />
                  <button
                    onClick={handleInfer}
                    disabled={isInferring || !inferInput.trim()}
                    className="absolute right-3 bottom-3 h-8 w-8 rounded-md flex items-center justify-center bg-cb-cyan text-surface-dim hover:bg-cb-cyan/80 disabled:opacity-20 transition-all"
                  >
                    {isInferring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Section 4: Job History ── */}
          {jobs.length > 0 && (
            <Collapsible>
              <div className="rounded-lg border border-dashed border-border-default overflow-hidden">
                <CollapsibleTrigger className="w-full flex items-center gap-3 px-6 py-4 hover:bg-surface-raised transition-colors cursor-pointer">
                  <ChevronRight className="w-4 h-4 text-text-dim" />
                  <Clock className="w-4 h-4 text-text-muted" />
                  <span className="font-mono text-sm text-text-primary font-medium">// job_history</span>
                  <span className="ml-auto font-mono text-[11px] px-2 py-0.5 rounded-md border border-dashed border-border-default text-text-muted">{jobs.length}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-dashed border-border-default">
                    {jobs.map((job) => (
                      <div key={job.id} className="flex items-center gap-4 px-6 py-3.5 border-b border-dashed border-border-default last:border-b-0 hover:bg-surface-raised/50 transition-colors">
                        <StatusIcon status={job.status} />
                        <span className="font-mono text-xs text-text-secondary truncate flex-1">{job.config.model.split("/").pop()}</span>
                        <span className={`font-mono text-[11px] px-2 py-0.5 rounded-md border border-dashed ${statusStyle(job.status)}`}>{job.status}</span>
                        {job.current_loss != null && <span className="font-mono text-[11px] text-text-dim">loss: {job.current_loss.toFixed(4)}</span>}
                        <span className="font-mono text-[10px] text-text-dim">{job.current_step}/{job.total_steps} steps</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed": return <CheckCircle2 className="w-4 h-4 text-cb-green shrink-0" />;
    case "running": return <Loader2 className="w-4 h-4 text-cb-yellow shrink-0 animate-spin" />;
    case "failed": return <AlertCircle className="w-4 h-4 text-cb-red shrink-0" />;
    default: return <Clock className="w-4 h-4 text-text-dim shrink-0" />;
  }
}

function statusStyle(status: string): string {
  switch (status) {
    case "completed": return "border-cb-green/30 text-cb-green";
    case "running": return "border-cb-yellow/30 text-cb-yellow";
    case "failed": case "cancelled": return "border-cb-red/30 text-cb-red";
    default: return "border-border-default text-text-muted";
  }
}

function eventColor(type: string): string {
  switch (type) {
    case "finetune-start": return "text-cb-blue";
    case "finetune-progress": return "text-cb-cyan";
    case "finetune-validation": return "text-cb-purple";
    case "finetune-saving": return "text-cb-yellow";
    case "finetune-done": return "text-cb-green";
    case "finetune-error": return "text-cb-red";
    default: return "text-text-muted";
  }
}
