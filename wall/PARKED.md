# This folder does not belong to the directory app

`wall/` is **The Wall** — a separate, standalone application. It shares no code,
no database and no Supabase project with the UP Irrigation Posting Directory that
lives at the root of this repository. Nothing at the root was changed to add it.

It is parked here only because it had nowhere else to go yet. It is meant to live
in its own repository.

## Moving it into its own repo

1. On GitHub press **New repository**. Name it `maaef-wall`, keep it **private**,
   and do **not** tick "Add a README", ".gitignore" or a licence — it has to start
   completely empty.
2. Then, from a checkout of this branch:

```bash
cd wall
git init
git add .
git commit -m "The Wall"
git branch -M main
git remote add origin https://github.com/AlphaMaximus001/maaef-wall.git
git push -u origin main
```

3. Delete this `wall/` folder from the directory repo and commit that removal.

Setup, deployment and how the thing works are all in `README.md` next to this file.
