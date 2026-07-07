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

Do not commit downloaded large data files unless the team explicitly decides to version them.

`public_restrooms.csv` must include latitude/longitude columns to support nearby-distance lookup.
Public restroom exports that only contain addresses are skipped until they are geocoded.
