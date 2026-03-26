import { useProvidersStore } from "../../stores/providers";

export function ProviderSelect() {
  const { providers, currentProvider, currentModel, switching, switchProvider } = useProvidersStore();

  const current = providers.find((p) => p.id === currentProvider);
  const models = current?.models ?? [];

  const selectStyle: React.CSSProperties = {
    fontSize: "9px",
    color: "var(--color-text)",
    background: "var(--color-bg-secondary)",
    border: "0.5px solid var(--color-border)",
    borderRadius: "2px",
    padding: "2px 18px 2px 6px",
    outline: "none",
    fontFamily: "var(--font-mono)",
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={currentProvider}
        onChange={(e) => {
          const p = providers.find((x) => x.id === e.target.value);
          if (p) switchProvider(p.id, p.models[0] ?? "");
        }}
        style={selectStyle}
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        value={currentModel}
        onChange={(e) => switchProvider(currentProvider, e.target.value)}
        style={selectStyle}
      >
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      {switching && (
        <span className="font-mono" style={{ fontSize: "8px", color: "var(--color-yellow)" }}>
          switching...
        </span>
      )}
    </div>
  );
}
