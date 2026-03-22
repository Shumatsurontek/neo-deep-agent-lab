"""Sandbox script — generates a Seaborn chart from CSV stdin → base64 PNG stdout.

Usage inside sandbox:
    echo CSV_DATA | python3 /opt/scripts/chart.py <chart_type> <title>

Supported chart types: bar, line, scatter, hist, heatmap, pie, box.
"""

import base64
import io
import sys
import warnings

warnings.filterwarnings("ignore")

import matplotlib  # noqa: E402

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402
import seaborn as sns  # noqa: E402

sns.set_theme(style="darkgrid", palette="muted")

# ── Read CSV from stdin ──────────────────────────────────────────────
csv_data = sys.stdin.read().strip()
if not csv_data:
    print("EMPTY", file=sys.stderr)
    sys.exit(1)

df = pd.read_csv(io.StringIO(csv_data))
if df.empty:
    print("EMPTY", file=sys.stderr)
    sys.exit(1)

chart_type = sys.argv[1]
title = sys.argv[2]

numeric_cols = df.select_dtypes(include="number").columns.tolist()
all_cols = df.columns.tolist()

# ── Render chart ─────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(10, 6))

if chart_type == "bar":
    if numeric_cols and len(all_cols) >= 2:
        x_col = next((c for c in all_cols if c not in numeric_cols), all_cols[0])
        sns.barplot(data=df.head(30), x=x_col, y=numeric_cols[0], ax=ax)
        ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha="right")
    else:
        df.head(30).plot(kind="bar", ax=ax)

elif chart_type == "line":
    if numeric_cols:
        for col in numeric_cols[:5]:
            ax.plot(df[col].values, label=col)
        ax.legend()
    else:
        df.head(100).plot(ax=ax)

elif chart_type == "scatter":
    if len(numeric_cols) >= 2:
        sns.scatterplot(data=df, x=numeric_cols[0], y=numeric_cols[1], ax=ax)
    elif len(all_cols) >= 2:
        df.plot(kind="scatter", x=all_cols[0], y=all_cols[1], ax=ax)

elif chart_type == "hist":
    if numeric_cols:
        sns.histplot(data=df, x=numeric_cols[0], kde=True, ax=ax)
    else:
        df.iloc[:, 0].value_counts().head(20).plot(kind="bar", ax=ax)

elif chart_type == "heatmap":
    if len(numeric_cols) >= 2:
        sns.heatmap(
            df[numeric_cols].corr(), annot=True, fmt=".2f", cmap="coolwarm", ax=ax
        )
    else:
        print("NEED_NUMERIC", file=sys.stderr)
        sys.exit(1)

elif chart_type == "pie":
    if len(all_cols) >= 2 and numeric_cols:
        x_col = next((c for c in all_cols if c not in numeric_cols), all_cols[0])
        data = df.head(10)
        ax.pie(data[numeric_cols[0]], labels=data[x_col], autopct="%1.1f%%")
    else:
        df.iloc[:, 0].value_counts().head(10).plot(kind="pie", ax=ax, autopct="%1.1f%%")

elif chart_type == "box":
    if numeric_cols:
        sns.boxplot(data=df[numeric_cols], ax=ax)
    else:
        df.plot(kind="box", ax=ax)

else:
    sns.barplot(data=df.head(30), ax=ax)

ax.set_title(title, fontsize=14, fontweight="bold")
plt.tight_layout()

# ── Output base64-encoded PNG ────────────────────────────────────────
buf = io.BytesIO()
fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
plt.close(fig)
buf.seek(0)
print(base64.b64encode(buf.read()).decode())
