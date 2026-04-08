import { useEffect, useRef, useState } from "react";
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
  ChevronDown,
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
  RefreshCw,
  Upload,
  BarChart3,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const MODELS = [
  { id: "unsloth/Qwen3.5-0.8B", label: "Qwen 3.5 — 0.8B", vram: "3 GB", engine: "Unsloth" },
  { id: "unsloth/Qwen3.5-2B", label: "Qwen 3.5 — 2B", vram: "5 GB", engine: "Unsloth" },
  { id: "unsloth/Qwen3.5-4B", label: "Qwen 3.5 — 4B", vram: "10 GB", engine: "Unsloth" },
  { id: "unsloth/Qwen3.5-9B", label: "Qwen 3.5 — 9B", vram: "22 GB", engine: "Unsloth" },
  { id: "LiquidAI/LFM2.5-350M", label: "LFM 2.5 — 350M", vram: "<1 GB", engine: "Transformers" },
];

const DATASETS = [
  { id: "Shumatsurontek/neo-sql-reasoning-combined", label: "SQL+Reasoning+Math", records: "7.2K" },
  { id: "gretelai/synthetic_text_to_sql", label: "SQL Only", records: "105K" },
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
    trainedModels, selectedModelPath, servingUrl, isServing, inferMessages, isInferring,
    selectModel, loadModels, pushModel, deployModel, sendInference,
    isEvaluating, evalEvents, evalResult, runCompare, clearEval,
    isSqlEvaluating, sqlEvalResult, runSqlEval,
  } = useFineTuneStore();

  const [inferInput, setInferInput] = useState("");
  const [showWandbKey, setShowWandbKey] = useState(false);
  const [showHfToken, setShowHfToken] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(true);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [evalBaseline, setEvalBaseline] = useState("unsloth/Qwen3.5-4B");
  const [evalFinetuned, setEvalFinetuned] = useState("Shumatsurontek/Qwen3.5-4B-neo");
  const [evalTasks, setEvalTasks] = useState("leaderboard_bbh,leaderboard_ifeval,leaderboard_musr");
  const [evalLimit, setEvalLimit] = useState(50);
  const inferBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadJobs();
    loadModels();
  }, [loadJobs, loadModels]);

  useEffect(() => {
    inferBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [inferMessages]);

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
    <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">

      {/* ══ Left Column: Training Config + Monitor ══ */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-dashed border-border-default">
        <ScrollArea className="flex-1">
          <div className="px-6 lg:px-8 py-6 space-y-5 max-w-2xl">

            {/* Config Form — collapsible */}
            <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
              <div className="rounded-lg border border-dashed border-border-default bg-surface-base overflow-hidden">
                <CollapsibleTrigger className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-raised/50 transition-colors cursor-pointer">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cb-blue/10 border border-dashed border-cb-blue/20 shrink-0">
                    <Cpu className="w-3.5 h-3.5 text-cb-blue" />
                  </div>
                  <div className="flex-1 text-left">
                    <h2 className="font-mono text-sm text-text-primary font-medium">// model_config</h2>
                    <p className="font-mono text-[10px] text-text-dim mt-0.5">LoRA bf16 · Modal + Unsloth</p>
                  </div>
                  {configOpen ? <ChevronDown className="w-4 h-4 text-text-dim" /> : <ChevronRight className="w-4 h-4 text-text-dim" />}
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-5 pb-5 space-y-5 border-t border-dashed border-border-default pt-4">
                    {/* Model selector */}
                    <div>
                      <label className="font-mono text-[10px] text-text-dim uppercase tracking-widest mb-2 block">model</label>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {MODELS.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => updateConfig({ model: m.id })}
                            disabled={isTraining}
                            className={`text-left font-mono text-[11px] px-3 py-2.5 rounded-md border border-dashed transition-all ${
                              config.model === m.id
                                ? "border-cb-blue/40 bg-cb-blue/5 text-cb-blue"
                                : "border-border-default text-text-muted hover:border-cb-blue/20 hover:text-text-secondary"
                            } disabled:opacity-50`}
                          >
                            <div className="font-medium truncate">{m.label}</div>
                            <div className="flex gap-2 text-[9px] text-text-dim mt-0.5">
                              <span>{m.vram}</span>
                              <span className="text-cb-blue/50">{m.engine}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dataset + GPU row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-mono text-[10px] text-text-dim uppercase tracking-widest mb-2 block">dataset</label>
                        <div className="space-y-1">
                          {DATASETS.map((d) => (
                            <button
                              key={d.id}
                              onClick={() => updateConfig({ dataset: d.id })}
                              disabled={isTraining}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md border border-dashed text-left transition-all ${
                                config.dataset === d.id
                                  ? "border-cb-blue/40 bg-cb-blue/5 text-cb-blue"
                                  : "border-border-default text-text-muted hover:border-cb-blue/20"
                              } disabled:opacity-50`}
                            >
                              <Database className="w-3 h-3 shrink-0" />
                              <span className="font-mono text-[10px] flex-1 truncate">{d.label}</span>
                              <span className="font-mono text-[9px] text-text-dim">{d.records}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="font-mono text-[10px] text-text-dim uppercase tracking-widest mb-2 block">gpu</label>
                        <div className="flex gap-1.5">
                          {GPUS.map((g) => (
                            <button
                              key={g.id}
                              onClick={() => updateConfig({ gpu: g.id })}
                              disabled={isTraining}
                              className={`flex-1 font-mono text-[10px] text-center py-2 rounded-md border border-dashed transition-all ${
                                config.gpu === g.id
                                  ? "border-cb-blue/40 bg-cb-blue/5 text-cb-blue"
                                  : "border-border-default text-text-muted hover:border-cb-blue/20"
                              } disabled:opacity-50`}
                            >
                              {g.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Hyperparameters */}
                    <div>
                      <label className="font-mono text-[10px] text-text-dim uppercase tracking-widest mb-2 block">hyperparameters</label>
                      <div className="grid grid-cols-4 gap-2">
                        {([
                          { key: "num_epochs", label: "epochs", step: 1 },
                          { key: "learning_rate", label: "lr", step: 0.0001 },
                          { key: "batch_size", label: "batch", step: 1 },
                          { key: "max_seq_length", label: "seq_len", step: 256 },
                          { key: "lora_r", label: "lora_r", step: 4 },
                          { key: "lora_alpha", label: "lora_α", step: 4 },
                          { key: "dataset_max_samples", label: "samples", step: 1000 },
                        ] as const).map((param) => (
                          <div key={param.key}>
                            <label className="font-mono text-[9px] text-text-dim block mb-1">{param.label}</label>
                            <input
                              type="number"
                              step={param.step}
                              value={config[param.key]}
                              onChange={(e) => updateConfig({ [param.key]: Number(e.target.value) })}
                              disabled={isTraining}
                              className="w-full h-8 font-mono text-[11px] bg-surface-dim border border-dashed border-border-default rounded-md px-2 text-text-primary focus:border-cb-blue focus:ring-1 focus:ring-cb-blue outline-none disabled:opacity-50"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* W&B + HF Push row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-mono text-[10px] text-text-dim uppercase tracking-widest mb-2 block">wandb</label>
                        <div className="relative">
                          <input
                            type={showWandbKey ? "text" : "password"}
                            value={config.wandb_api_key}
                            onChange={(e) => updateConfig({ wandb_api_key: e.target.value })}
                            placeholder="api_key (optional)..."
                            disabled={isTraining}
                            className="w-full h-8 font-mono text-[11px] bg-surface-dim border border-dashed border-border-default rounded-md px-3 pr-8 text-text-primary placeholder:text-text-dim focus:border-cb-blue focus:ring-1 focus:ring-cb-blue outline-none disabled:opacity-50"
                          />
                          <button
                            type="button"
                            onClick={() => setShowWandbKey(!showWandbKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-muted transition-colors"
                          >
                            {showWandbKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="font-mono text-[10px] text-text-dim uppercase tracking-widest mb-2 block">hf push</label>
                        <div className="relative">
                          <input
                            type={showHfToken ? "text" : "password"}
                            value={config.hf_token}
                            onChange={(e) => updateConfig({ hf_token: e.target.value })}
                            placeholder="hf_token (optional)..."
                            disabled={isTraining}
                            className="w-full h-8 font-mono text-[11px] bg-surface-dim border border-dashed border-border-default rounded-md px-3 pr-8 text-text-primary placeholder:text-text-dim focus:border-cb-blue focus:ring-1 focus:ring-cb-blue outline-none disabled:opacity-50"
                          />
                          <button
                            type="button"
                            onClick={() => setShowHfToken(!showHfToken)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-muted transition-colors"
                          >
                            {showHfToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* HF Repo + Push toggle */}
                    {config.hf_token && (
                      <div className="flex items-center gap-3">
                        <input
                          value={config.hf_repo}
                          onChange={(e) => updateConfig({ hf_repo: e.target.value })}
                          placeholder="Shumatsurontek/lfm2-sql-finetuned"
                          disabled={isTraining}
                          className="flex-1 h-8 font-mono text-[11px] bg-surface-dim border border-dashed border-border-default rounded-md px-3 text-text-primary placeholder:text-text-dim focus:border-cb-blue focus:ring-1 focus:ring-cb-blue outline-none disabled:opacity-50"
                        />
                        <button
                          onClick={() => updateConfig({ hf_push: !config.hf_push })}
                          disabled={isTraining}
                          className={`flex items-center gap-1.5 font-mono text-[10px] px-3 py-1.5 rounded-md border border-dashed transition-all shrink-0 ${
                            config.hf_push
                              ? "border-cb-blue/40 bg-cb-blue/10 text-cb-blue"
                              : "border-border-default text-text-dim hover:border-cb-blue/20"
                          } disabled:opacity-50`}
                        >
                          <Upload className="w-3 h-3" />
                          {config.hf_push ? "push: on" : "push: off"}
                        </button>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Action bar */}
            <div className="flex items-center gap-3">
              {!isTraining ? (
                <button
                  onClick={() => { setConfigOpen(false); startJob(); }}
                  className="flex items-center gap-2 font-mono text-xs text-surface-dim bg-cb-blue px-5 py-2.5 rounded-lg hover:bg-cb-blue-hover transition-colors font-medium"
                >
                  <Play className="w-3.5 h-3.5" />
                  train()
                </button>
              ) : (
                <button
                  onClick={() => activeJob && cancelJob(activeJob.id)}
                  className="flex items-center gap-2 font-mono text-xs text-cb-red px-5 py-2.5 rounded-lg border border-dashed border-cb-red/30 hover:bg-cb-red/10 transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />
                  cancel()
                </button>
              )}
              {events.length > 0 && !isTraining && (
                <button onClick={clearEvents} className="font-mono text-[10px] text-text-dim hover:text-text-muted transition-colors">
                  clear()
                </button>
              )}
            </div>

            {/* Training Monitor */}
            {(isTraining || events.length > 0) && (
              <div className="rounded-lg border border-dashed border-border-default bg-surface-base p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-3.5 h-3.5 text-cb-yellow" />
                  <span className="font-mono text-xs text-text-primary font-medium">// monitor</span>
                  {isTraining && <Loader2 className="w-3.5 h-3.5 text-cb-yellow animate-spin ml-auto" />}
                  {!isTraining && activeJob?.status === "completed" && <CheckCircle2 className="w-3.5 h-3.5 text-cb-green ml-auto" />}
                </div>

                {/* Progress bar */}
                {activeJob && activeJob.total_steps > 0 && (
                  <div>
                    <div className="flex justify-between font-mono text-[10px] text-text-muted mb-1.5">
                      <span>step {activeJob.current_step}/{activeJob.total_steps}</span>
                      <span>{progressPct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-dim overflow-hidden">
                      <div className="h-full rounded-full bg-cb-blue transition-all duration-300" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                )}

                {/* Metrics badges */}
                <div className="flex flex-wrap gap-2">
                  {activeJob?.current_loss != null && (
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-dashed border-border-default text-text-muted">
                      loss <span className="text-cb-blue">{activeJob.current_loss.toFixed(4)}</span>
                    </span>
                  )}
                  {lastEvent?.learning_rate != null && (
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-dashed border-border-default text-text-muted">
                      lr <span className="text-cb-cyan">{lastEvent.learning_rate.toExponential(1)}</span>
                    </span>
                  )}
                  {lastEvent?.epoch != null && (
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-dashed border-border-default text-text-muted">
                      epoch <span className="text-cb-green">{lastEvent.epoch}</span>
                    </span>
                  )}
                </div>

                {/* Loss chart */}
                {lossHistory.length > 1 && (
                  <div className="h-40 rounded-md border border-dashed border-border-default bg-surface-dim p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={lossHistory}>
                        <XAxis dataKey="step" tick={{ fill: "#666", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "#1E1E1E" }} tickLine={false} />
                        <YAxis tick={{ fill: "#666", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "#1E1E1E" }} tickLine={false} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={{ background: "#111", border: "1px dashed #1E1E1E", borderRadius: "6px", fontFamily: "JetBrains Mono", fontSize: "10px", color: "#E0E0E0" }} labelFormatter={(v) => `step ${v}`} />
                        <Line type="monotone" dataKey="loss" stroke="#00FF88" strokeWidth={1.5} dot={false} activeDot={{ r: 2, fill: "#00FF88" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Event log — collapsible */}
                {events.length > 0 && (
                  <Collapsible open={eventsOpen} onOpenChange={setEventsOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 font-mono text-[10px] text-text-dim hover:text-text-muted cursor-pointer transition-colors">
                      {eventsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      logs ({events.length})
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="max-h-28 overflow-y-auto mt-2 space-y-0.5">
                        {events.map((evt, i) => (
                          <div key={i} className="flex items-start gap-1.5 font-mono text-[10px]">
                            <span className={`shrink-0 ${eventColor(evt.type)}`}>[{evt.type.replace("finetune-", "")}]</span>
                            <span className="text-text-dim truncate">{evt.message}</span>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )}

            {/* Job History */}
            {jobs.length > 0 && (
              <Collapsible>
                <div className="rounded-lg border border-dashed border-border-default overflow-hidden">
                  <CollapsibleTrigger className="w-full flex items-center gap-2.5 px-5 py-3 hover:bg-surface-raised/50 transition-colors cursor-pointer">
                    <ChevronRight className="w-3.5 h-3.5 text-text-dim" />
                    <Clock className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-mono text-xs text-text-primary">// history</span>
                    <span className="ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded border border-dashed border-border-default text-text-muted">{jobs.length}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-dashed border-border-default">
                      {jobs.map((job) => (
                        <div key={job.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-dashed border-border-default last:border-b-0 hover:bg-surface-raised/30 transition-colors">
                          <StatusIcon status={job.status} />
                          <span className="font-mono text-[11px] text-text-secondary truncate flex-1">{job.config.model.split("/").pop()}</span>
                          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border border-dashed ${statusStyle(job.status)}`}>{job.status}</span>
                          {job.current_loss != null && <span className="font-mono text-[10px] text-text-dim">{job.current_loss.toFixed(3)}</span>}
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            {/* ── Benchmark ── */}
            <div className="rounded-lg border border-dashed border-border-default bg-surface-base overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cb-purple/10 border border-dashed border-cb-purple/20 shrink-0">
                  <BarChart3 className="w-3.5 h-3.5 text-cb-purple" />
                </div>
                <div className="flex-1">
                  <h2 className="font-mono text-sm text-text-primary font-medium">// benchmark</h2>
                  <p className="font-mono text-[10px] text-text-dim mt-0.5">lm-eval · baseline vs finetuned</p>
                </div>
                {evalEvents.length > 0 && !isEvaluating && (
                  <button onClick={clearEval} className="font-mono text-[10px] text-text-dim hover:text-text-muted transition-colors px-2 py-1 rounded border border-dashed border-border-default">
                    reset
                  </button>
                )}
              </div>

              <div className="px-5 pb-5 space-y-4 border-t border-dashed border-border-default pt-4">
                {/* Two model inputs side by side */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="font-mono text-[9px] text-text-dim uppercase tracking-widest mb-1 block">baseline</label>
                    <input
                      value={evalBaseline}
                      onChange={(e) => setEvalBaseline(e.target.value)}
                      disabled={isEvaluating}
                      className="w-full h-8 font-mono text-[11px] bg-surface-dim border border-dashed border-border-default rounded-md px-2.5 text-text-muted focus:border-cb-purple focus:ring-1 focus:ring-cb-purple outline-none disabled:opacity-50"
                    />
                  </div>
                  <ArrowUpDown className="w-3.5 h-3.5 text-text-dim shrink-0 mb-2" />
                  <div className="flex-1">
                    <label className="font-mono text-[9px] text-text-dim uppercase tracking-widest mb-1 block">finetuned</label>
                    <input
                      value={evalFinetuned}
                      onChange={(e) => setEvalFinetuned(e.target.value)}
                      disabled={isEvaluating}
                      className="w-full h-8 font-mono text-[11px] bg-surface-dim border border-dashed border-border-default rounded-md px-2.5 text-cb-purple focus:border-cb-purple focus:ring-1 focus:ring-cb-purple outline-none disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Tasks + Limit + Run — single row */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="font-mono text-[9px] text-text-dim uppercase tracking-widest mb-1 block">tasks</label>
                    <input
                      value={evalTasks}
                      onChange={(e) => setEvalTasks(e.target.value)}
                      disabled={isEvaluating}
                      className="w-full h-8 font-mono text-[11px] bg-surface-dim border border-dashed border-border-default rounded-md px-2.5 text-text-primary focus:border-cb-purple focus:ring-1 focus:ring-cb-purple outline-none disabled:opacity-50"
                    />
                  </div>
                  <div className="w-16">
                    <label className="font-mono text-[9px] text-text-dim uppercase tracking-widest mb-1 block">limit</label>
                    <input
                      type="number"
                      value={evalLimit}
                      onChange={(e) => setEvalLimit(Number(e.target.value))}
                      disabled={isEvaluating}
                      className="w-full h-8 font-mono text-[11px] bg-surface-dim border border-dashed border-border-default rounded-md px-2 text-center text-text-primary focus:border-cb-purple focus:ring-1 focus:ring-cb-purple outline-none disabled:opacity-50"
                    />
                  </div>
                  {!isEvaluating ? (
                    <button
                      onClick={() => runCompare(evalBaseline, evalFinetuned, evalTasks, evalLimit || undefined)}
                      className="h-8 flex items-center gap-1.5 font-mono text-[11px] text-surface-dim bg-cb-purple px-4 rounded-md hover:bg-cb-purple/80 transition-colors font-medium shrink-0"
                    >
                      <Play className="w-3 h-3" />
                      run
                    </button>
                  ) : (
                    <div className="h-8 flex items-center gap-1.5 font-mono text-[11px] text-cb-purple px-3 shrink-0">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Progress — compact status line */}
                {isEvaluating && evalEvents.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-cb-purple/5 border border-dashed border-cb-purple/15">
                    <Loader2 className="w-3 h-3 text-cb-purple animate-spin shrink-0" />
                    <span className="font-mono text-[10px] text-text-secondary truncate">
                      {evalEvents.at(-1)?.message}
                    </span>
                  </div>
                )}

                {/* Results — only show aggregate scores, filter out subtasks */}
                {evalResult?.comparison && (() => {
                  const mainTasks = Object.entries(evalResult.comparison).filter(
                    ([task]) => !task.includes("_") || task === "gsm8k_cot"
                  );
                  return (
                    <div className="space-y-3">
                      {/* Score cards */}
                      <div className="grid grid-cols-2 gap-2">
                        {mainTasks.map(([task, metrics]) => {
                          const acc = metrics.acc_norm || metrics.acc || metrics.exact_match || metrics.prompt_level_strict_acc || Object.values(metrics)[0];
                          if (!acc) return null;
                          const delta = acc.delta;
                          return (
                            <div key={task} className="rounded-lg border border-dashed border-border-default p-3 space-y-2">
                              <div className="font-mono text-[10px] text-text-dim uppercase tracking-widest">{task.replace("_cot", " (CoT)")}</div>
                              <div className="flex items-baseline justify-between gap-2">
                                <div>
                                  <div className="font-mono text-[9px] text-text-dim">base</div>
                                  <div className="font-mono text-lg text-text-muted">
                                    {acc.baseline != null ? (acc.baseline * 100).toFixed(1) : "—"}
                                    <span className="text-[10px] text-text-dim">%</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-mono text-[9px] text-text-dim">tuned</div>
                                  <div className="font-mono text-lg text-text-primary font-medium">
                                    {acc.finetuned != null ? (acc.finetuned * 100).toFixed(1) : "—"}
                                    <span className="text-[10px] text-text-dim">%</span>
                                  </div>
                                </div>
                              </div>
                              {delta != null && (
                                <div className={`flex items-center justify-center gap-1 font-mono text-xs py-1 rounded-md ${
                                  delta > 0.001 ? "text-cb-green bg-cb-green/5" : delta < -0.001 ? "text-cb-red bg-cb-red/5" : "text-text-dim bg-surface-dim"
                                }`}>
                                  {delta > 0.001 ? <TrendingUp className="w-3 h-3" /> : delta < -0.001 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                  {delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)}%
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Expandable detail table */}
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-1.5 font-mono text-[10px] text-text-dim hover:text-text-muted cursor-pointer transition-colors">
                          <ChevronRight className="w-3 h-3" />
                          all subtasks ({Object.keys(evalResult.comparison).length})
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 rounded-md border border-dashed border-border-default overflow-hidden max-h-52 overflow-y-auto">
                            <table className="w-full">
                              <thead className="sticky top-0 bg-surface-base">
                                <tr>
                                  <th className="font-mono text-[9px] text-text-dim uppercase text-left px-2.5 py-1.5">task</th>
                                  <th className="font-mono text-[9px] text-text-dim uppercase text-right px-2.5 py-1.5">base</th>
                                  <th className="font-mono text-[9px] text-text-dim uppercase text-right px-2.5 py-1.5">tuned</th>
                                  <th className="font-mono text-[9px] text-text-dim uppercase text-right px-2.5 py-1.5">delta</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(evalResult.comparison).map(([task, metrics]) => {
                                  const acc = metrics.acc_norm || metrics.acc || metrics.exact_match || metrics.prompt_level_strict_acc || Object.values(metrics)[0];
                                  if (!acc) return null;
                                  return (
                                    <tr key={task} className="border-t border-dashed border-border-default/50">
                                      <td className="font-mono text-[10px] text-text-secondary px-2.5 py-1 truncate max-w-[200px]">{task}</td>
                                      <td className="font-mono text-[10px] text-text-muted text-right px-2.5 py-1">
                                        {acc.baseline != null ? (acc.baseline * 100).toFixed(0) : "—"}
                                      </td>
                                      <td className="font-mono text-[10px] text-text-primary text-right px-2.5 py-1">
                                        {acc.finetuned != null ? (acc.finetuned * 100).toFixed(0) : "—"}
                                      </td>
                                      <td className={`font-mono text-[10px] text-right px-2.5 py-1 ${
                                        acc.delta != null && acc.delta > 0.001 ? "text-cb-green" : acc.delta != null && acc.delta < -0.001 ? "text-cb-red" : "text-text-dim"
                                      }`}>
                                        {acc.delta != null ? `${acc.delta > 0 ? "+" : ""}${(acc.delta * 100).toFixed(0)}` : "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>

                      {/* HF push status */}
                      {config.hf_token && config.hf_repo && (
                        <div className="font-mono text-[10px] text-cb-green flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3" />
                          Results pushed to {config.hf_repo}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── SQL Eval ── */}
            <div className="rounded-lg border border-dashed border-border-default bg-surface-base overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cb-cyan/10 border border-dashed border-cb-cyan/20 shrink-0">
                  <Database className="w-3.5 h-3.5 text-cb-cyan" />
                </div>
                <div className="flex-1">
                  <h2 className="font-mono text-sm text-text-primary font-medium">// sql_eval</h2>
                  <p className="font-mono text-[10px] text-text-dim mt-0.5">exact match on held-out samples</p>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-3 border-t border-dashed border-border-default pt-4">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="font-mono text-[9px] text-text-dim uppercase tracking-widest mb-1 block">model</label>
                    <input
                      value={evalFinetuned}
                      onChange={(e) => setEvalFinetuned(e.target.value)}
                      disabled={isSqlEvaluating}
                      className="w-full h-8 font-mono text-[11px] bg-surface-dim border border-dashed border-border-default rounded-md px-2.5 text-cb-cyan focus:border-cb-cyan focus:ring-1 focus:ring-cb-cyan outline-none disabled:opacity-50"
                    />
                  </div>
                  <div className="w-16">
                    <label className="font-mono text-[9px] text-text-dim uppercase tracking-widest mb-1 block">samples</label>
                    <input
                      type="number"
                      value={evalLimit}
                      onChange={(e) => setEvalLimit(Number(e.target.value))}
                      disabled={isSqlEvaluating}
                      className="w-full h-8 font-mono text-[11px] bg-surface-dim border border-dashed border-border-default rounded-md px-2 text-center text-text-primary focus:border-cb-cyan focus:ring-1 focus:ring-cb-cyan outline-none disabled:opacity-50"
                    />
                  </div>
                  {!isSqlEvaluating ? (
                    <button
                      onClick={() => runSqlEval(evalFinetuned, evalLimit || 100)}
                      className="h-8 flex items-center gap-1.5 font-mono text-[11px] text-surface-dim bg-cb-cyan px-4 rounded-md hover:bg-cb-cyan/80 transition-colors font-medium shrink-0"
                    >
                      <Play className="w-3 h-3" />
                      run
                    </button>
                  ) : (
                    <div className="h-8 flex items-center gap-1.5 font-mono text-[11px] text-cb-cyan px-3 shrink-0">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Progress */}
                {isSqlEvaluating && evalEvents.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-cb-cyan/5 border border-dashed border-cb-cyan/15">
                    <Loader2 className="w-3 h-3 text-cb-cyan animate-spin shrink-0" />
                    <span className="font-mono text-[10px] text-text-secondary truncate">
                      {evalEvents.at(-1)?.message}
                    </span>
                  </div>
                )}

                {/* Result card */}
                {sqlEvalResult && (
                  <div className="rounded-lg border border-dashed border-cb-cyan/20 p-4 text-center space-y-2">
                    <div className="font-mono text-[10px] text-text-dim uppercase tracking-widest">SQL Exact Match</div>
                    <div className="font-mono text-3xl text-cb-cyan font-medium">
                      {(sqlEvalResult.accuracy * 100).toFixed(1)}<span className="text-sm text-text-dim">%</span>
                    </div>
                    <div className="font-mono text-[10px] text-text-dim">
                      {sqlEvalResult.correct} / {sqlEvalResult.num_samples} correct
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* ══ Right Column: Inference Panel ══ */}
      <div className="w-[380px] shrink-0 flex flex-col bg-surface-dim">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-dashed border-border-default shrink-0">
          <Server className="w-4 h-4 text-cb-cyan" />
          <span className="font-mono text-xs text-text-primary font-medium">// inference</span>
          {servingUrl && (
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-cb-green">
              <span className="w-1.5 h-1.5 rounded-full bg-cb-green animate-pulse" />
              live
            </span>
          )}
        </div>

        {/* Models + Deploy */}
        <div className="px-5 py-4 border-b border-dashed border-border-default shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[10px] text-text-dim uppercase tracking-widest">models</label>
            <button onClick={loadModels} className="text-text-dim hover:text-text-muted transition-colors" title="Refresh">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {trainedModels.length > 0 ? (
            <div className="space-y-1">
              {trainedModels.map((m) => {
                const isSelected = selectedModelPath === m.path;
                return (
                  <button
                    key={m.name}
                    onClick={() => selectModel(m.path)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md border border-dashed text-left transition-all ${
                      isSelected
                        ? "border-cb-cyan/40 bg-cb-cyan/5"
                        : "border-border-default bg-surface-base hover:border-cb-cyan/20"
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? "bg-cb-cyan" : "bg-text-dim/30"}`} />
                    <span className={`font-mono text-[10px] flex-1 truncate ${isSelected ? "text-cb-cyan" : "text-text-secondary"}`} title={m.name}>
                      {m.name}
                    </span>
                    <span className="font-mono text-[9px] text-text-dim shrink-0">{m.size_mb}MB</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="font-mono text-[10px] text-text-dim">// train a model first</p>
          )}

          {trainedModels.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={deployModel}
                disabled={isServing}
                className={`flex-1 flex items-center justify-center gap-2 font-mono text-xs py-2.5 rounded-lg border border-dashed transition-colors ${
                  servingUrl
                    ? "border-cb-green/30 text-cb-green bg-cb-green/5"
                    : "border-cb-cyan/30 text-cb-cyan hover:bg-cb-cyan/5"
                } disabled:opacity-50`}
              >
                {isServing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                {servingUrl ? "serving()" : "deploy()"}
              </button>
              {config.hf_token && config.hf_repo && selectedModelPath && (
                <button
                  onClick={async () => {
                    setIsPushing(true);
                    setPushResult(null);
                    const r = await pushModel();
                    setPushResult(r);
                    setIsPushing(false);
                  }}
                  disabled={isPushing}
                  className="flex items-center justify-center gap-2 font-mono text-xs px-4 py-2.5 rounded-lg border border-dashed border-cb-blue/30 text-cb-blue hover:bg-cb-blue/5 transition-colors disabled:opacity-50"
                >
                  {isPushing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  push()
                </button>
              )}
            </div>
          )}

          {pushResult && (
            <div className="font-mono text-[9px] text-cb-green px-2.5 py-1.5 rounded-md border border-dashed border-cb-green/20 bg-cb-green/5 break-all">
              {pushResult}
            </div>
          )}

          {servingUrl && (
            <div className="font-mono text-[9px] text-text-dim px-2.5 py-1.5 rounded-md border border-dashed border-border-default bg-surface-base break-all leading-relaxed">
              <span className="text-cb-cyan">{servingUrl}</span>
            </div>
          )}
        </div>

        {/* Chat area — fills remaining space */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {servingUrl ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {inferMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Send className="w-8 h-8 text-text-dim/30 mb-3" />
                    <p className="font-mono text-[11px] text-text-dim">// send a query to your model</p>
                    <p className="font-mono text-[9px] text-text-dim/50 mt-1">Schema + Question format</p>
                  </div>
                )}
                {inferMessages.map((msg, i) => (
                  <div key={i} className={`font-mono text-[11px] px-3.5 py-3 rounded-lg border border-dashed ${
                    msg.role === "user"
                      ? "border-cb-blue/20 bg-cb-blue/5 text-text-primary"
                      : "border-border-default bg-surface-base text-text-secondary"
                  }`}>
                    <span className="text-[9px] text-text-dim block mb-1.5">
                      {msg.role === "user" ? "> user" : "< model"}
                    </span>
                    <pre className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</pre>
                  </div>
                ))}
                {isInferring && (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="w-3.5 h-3.5 text-cb-cyan animate-spin" />
                    <span className="font-mono text-[10px] text-text-dim">generating...</span>
                  </div>
                )}
                <div ref={inferBottomRef} />
              </div>

              {/* Input */}
              <div className="shrink-0 px-5 py-3 border-t border-dashed border-border-default">
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
                    placeholder="Schema: CREATE TABLE ...\nQuestion: How many ..."
                    rows={3}
                    className="w-full resize-none font-mono text-[11px] bg-surface-base border border-dashed border-border-default rounded-lg px-3.5 pr-11 py-2.5 text-text-primary placeholder:text-text-dim focus:border-cb-blue focus:ring-1 focus:ring-cb-blue outline-none leading-relaxed"
                  />
                  <button
                    onClick={handleInfer}
                    disabled={isInferring || !inferInput.trim()}
                    className="absolute right-2.5 bottom-2.5 h-7 w-7 rounded-md flex items-center justify-center bg-cb-cyan text-surface-dim hover:bg-cb-cyan/80 disabled:opacity-20 transition-all"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="w-16 h-16 rounded-xl border border-dashed border-border-default flex items-center justify-center mb-4">
                <Server className="w-7 h-7 text-text-dim/20" />
              </div>
              <p className="font-mono text-xs text-text-dim mb-1">// deploy to start inference</p>
              <p className="font-mono text-[10px] text-text-dim/50">
                Select a trained model and click deploy()
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed": return <CheckCircle2 className="w-3.5 h-3.5 text-cb-green shrink-0" />;
    case "running": return <Loader2 className="w-3.5 h-3.5 text-cb-yellow shrink-0 animate-spin" />;
    case "failed": return <AlertCircle className="w-3.5 h-3.5 text-cb-red shrink-0" />;
    default: return <Clock className="w-3.5 h-3.5 text-text-dim shrink-0" />;
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
