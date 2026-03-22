"""Sandbox script — computes pandas statistics from CSV stdin → text stdout.

Usage inside sandbox:
    echo CSV_DATA | python3 /opt/scripts/analysis.py <analysis_type>

Supported types: describe, corr, value_counts, info, nunique.
"""

import io
import sys
import warnings

warnings.filterwarnings("ignore")

import pandas as pd  # noqa: E402

# ── Read CSV from stdin ──────────────────────────────────────────────
csv_data = sys.stdin.read().strip()
if not csv_data:
    print("La requete ne retourne aucun resultat.")
    sys.exit(0)

df = pd.read_csv(io.StringIO(csv_data))
if df.empty:
    print("La requete ne retourne aucun resultat.")
    sys.exit(0)

analysis = sys.argv[1]

# ── Dispatch ─────────────────────────────────────────────────────────
if analysis == "describe":
    print(f"Shape: {df.shape[0]} lignes x {df.shape[1]} colonnes\n")
    print(df.describe(include="all").to_string())

elif analysis == "corr":
    numeric = df.select_dtypes(include="number")
    if numeric.shape[1] < 2:
        print("Pas assez de colonnes numeriques pour une correlation.")
    else:
        print(numeric.corr().round(3).to_string())

elif analysis == "value_counts":
    cat_cols = df.select_dtypes(exclude="number").columns
    if len(cat_cols) == 0:
        cat_cols = df.columns[:3]
    for col in cat_cols[:5]:
        print(f"\n--- {col} ---")
        print(df[col].value_counts().head(20).to_string())

elif analysis == "info":
    print(f"Shape: {df.shape[0]} lignes x {df.shape[1]} colonnes\n")
    for col in df.columns:
        dtype = df[col].dtype
        nulls = df[col].isnull().sum()
        pct = nulls / len(df) * 100
        print(f"  {col}: {dtype} | {nulls} nulls ({pct:.1f}%)")

elif analysis == "nunique":
    print(f"Shape: {df.shape[0]} lignes x {df.shape[1]} colonnes\n")
    for col in df.columns:
        n = df[col].nunique()
        print(f"  {col}: {n} valeurs uniques")

else:
    print(f"Type d'analyse inconnu: {analysis}")
    print("Types supportes: describe, corr, value_counts, info, nunique")
