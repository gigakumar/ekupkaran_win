# Trader Behavior vs Market Sentiment

This assignment explores how trader performance correlates with overall market sentiment in Bitcoin.

## Structure

```
├── notebook_1.ipynb   # Main Colab notebook
├── notebook_2.ipynb   # Optional additional analyses
├── csv_files/         # Raw and processed CSV data
│   └── .gitkeep
├── outputs/           # Generated charts and visuals
│   └── .gitkeep
├── ds_report.pdf      # Final report with insights (placeholder)
└── README.md          # This file
```

## Datasets
- Bitcoin Market Sentiment (Fear & Greed): `csv_files/fear_greed_index.csv` with columns `timestamp` (or `date`), `value`, `classification`.
- Hyperliquid Historical Trader Data: `csv_files/historical_data.csv` with columns like `account`, `symbol`, `execution price`, `size`, `side`, `time`, `start position`, `event`, `closedPnL`, `leverage`, etc.

## How to run in Google Colab (no assumptions)
1. Open `notebook_1.ipynb` in Google Colab.
2. In the "Configuration" cell, set:
   - `DATA_DIR` to the folder that contains your two CSVs.
   - `FG_FILE` and `TRADES_FILE` if you used different filenames.
   Optionally mount Google Drive yourself if your CSVs are on Drive.
3. Execute cells top-to-bottom. The notebook will:
   - Load datasets using the exact column names specified below (no automatic renaming)
   - Perform EDA
   - Build daily trading metrics (PnL, risk, volume, leverage, win-rate)
   - Join with sentiment using the original `classification` values
   - Save charts to `outputs/` (sibling of `DATA_DIR`'s parent) and a processed CSV to `csv_files/`

Outputs saved by the notebook:
- `csv_files/daily_metrics_with_sentiment.csv`
- `outputs/*.png` (charts)

## Required columns (strict)
- Fear/Greed CSV: `date`, `classification`, `value`
- Historical CSV: `time`, `closedPnL`, `size`, `leverage`, `side`

## Sharing requirement
- Share the Colab link(s) with access set to "Anyone with the link can view".
- Commit the same structure (and, if permitted, the CSVs) to this GitHub repo under `ds_harshit_kumar/`.

## Notes
- The notebook is robust to minor column name differences (it normalizes to lowercase with underscores).
- If your `historical_data.csv` uses different time formats, adjust the parsing cell accordingly.

