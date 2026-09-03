# CSV Parser Audit v1.5.1

Replaced naive `split(',')` with **`csv-parse`** (dependency).

Supports: quoted commas, escaped quotes (`""`), empty fields, CRLF, UTF-8 BOM.

Tests: `NATIVE_CSV_QUOTED_COMMA`, `NATIVE_CSV_ESCAPED_QUOTE`, `NATIVE_CSV_EMPTY_FIELD`.
