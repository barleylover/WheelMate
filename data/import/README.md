# WheelMate public data imports

Put public-data CSV files here before running:

```bash
pnpm run ingest
```

Recognized filenames:

- `bf_kead.csv`
- `bf_koddi.csv`
- `disability_facilities_standard.csv`
- `social_security_disability_facilities.csv`
- `public_restrooms.csv`
- `wheelchair_chargers.csv`
- `culture_barrier_free.csv`
- `gyeonggi_shared_disability_facilities.csv`
- `kto_barrier_free_travel.csv`
- `museum_standard.csv`

The team intentionally versions the two contest-runtime datasets below so the
container build is reproducible:

- `public_restrooms.csv`: [전국공중화장실표준데이터](https://www.data.go.kr/data/15012892/standard.do)
- `wheelchair_chargers.csv`: [전국전동휠체어급속충전기표준데이터](https://www.data.go.kr/data/15034533/standard.do)

Repository snapshot date: 2026-07-08 (from the file-add commit history).
Per-row data reference/update dates are retained in the imported metadata.

Record the source URL, download date, and data reference date whenever either
file is refreshed. Do not commit other downloaded large files without a team
decision and an explicit provenance entry here.

`public_restrooms.csv` can be imported with address-only rows. Rows with latitude/longitude are used
for distance lookup; address-only rows are matched by administrative address area and shown with
unknown distance.

Only rows whose male/female wheelchair-accessible fixture count is greater than
zero are imported as `accessible_restroom`. A generic public restroom row must
never be promoted to an accessible restroom merely because it exists.

Only wheelchair charger rows with `동시사용가능대수 > 0` are imported. Both
datasets remain reference data: absence from the file does not prove that no
facility exists, and users should verify current availability before visiting.
