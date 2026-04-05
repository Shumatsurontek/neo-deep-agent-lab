import { useProvidersStore } from "../../stores/providers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Loader2 } from "lucide-react";

export function ProviderSelect() {
  const { providers, currentProvider, currentModel, switching, switchProvider } = useProvidersStore();

  const current = providers.find((p) => p.id === currentProvider);
  const models = current?.models ?? [];

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentProvider}
        onValueChange={(val) => {
          const p = providers.find((x) => x.id === val);
          if (p) switchProvider(p.id, p.models[0] ?? "");
        }}
      >
        <SelectTrigger className="h-7 w-auto min-w-[80px] font-mono text-[10px] gap-1.5 rounded border-dashed">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="font-mono text-xs">
          {providers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentModel}
        onValueChange={(val) => { if (val) switchProvider(currentProvider, val); }}
      >
        <SelectTrigger className="h-7 w-auto min-w-[100px] font-mono text-[10px] gap-1.5 rounded border-dashed">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="font-mono text-xs">
          {models.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {switching && (
        <Loader2 className="w-3.5 h-3.5 text-cb-yellow animate-spin" />
      )}
    </div>
  );
}
