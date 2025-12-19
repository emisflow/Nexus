# Export schema and timezone guidance

## Formats
- **Long (default):** `entry_date`, `journal_text`, `metrics_json`, `habits_json`, `created_at`, `updated_at`.
  - Metrics and habits are emitted as JSON arrays to preserve all keys and values.
- **Wide (`?format=wide`):** `entry_date`, `journal_text`, a column per metric key (`metric:<key>`), a column per habit identifier (`habit:<id>`), `created_at`, `updated_at`.
  - Wide exports are optimized for Excel/Power BI pivoting and keep column order stable by sorting metric keys and habit identifiers alphabetically.

## Column types
- `entry_date`: `DATE` (YYYY-MM-DD) with no timezone component; represents the user's day boundary.
- `journal_text`: `TEXT`.
- `metrics_json`: JSON array of `{ key, value_num, value_text }` objects. `value_num` is numeric; `value_text` is string for non-numeric metrics.
- `habits_json`: JSON array of `{ habit_id, completed }` objects where `completed` is boolean.
- `metric:<key>` (wide): numeric when `value_num` is provided; otherwise string fallback from `value_text`.
- `habit:<id>` (wide): boolean (`true`/`false`).
- `created_at` / `updated_at`: `TIMESTAMPTZ` in UTC, ISO-8601 encoded in responses.

## Timezone handling
- API requests accept `from`/`to` filters as `YYYY-MM-DD` strings, applied server-side against `entry_date` without timezone conversion.
- Exports and analytics use UTC timestamps for `created_at` and `updated_at`; consumers should treat them as UTC when importing into BI tools.
- When converting to local timezones in spreadsheets/Power BI, rely on the UTC offset in the ISO strings to avoid drift.
