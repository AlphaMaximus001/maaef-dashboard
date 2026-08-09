# UP Irrigation Posting Directory

Internal directory for Maaef Enterprises. Tracks which officer sits on which sanctioned
post across the department hierarchy, and keeps the posting history of every person.

- **Dashboard** — read-only. Everyone who is let in lands here.
- **Search** — one box across names, positions, both phone numbers, offices and notes.
- **Chart** — the whole hierarchy on one page.
- **Entry** — create and edit offices, department cards and people. Admin and superadmin only.
- **Users** — approve sign-ups, set roles, grant per-office access. Superadmin only.
- **Changes** — every edit, who made it and when, with a revert button. Superadmin only.

Roles: `pending` → `viewer` → `admin` → `superadmin`.
Admins and superadmins see and edit everything. Viewers see only the offices granted to them.
A grant on a zone, circle or district cascades to everything beneath it.

---

## 1. Create the Supabase project

1. Go to supabase.com → **New project**. Region: **Mumbai (ap-south-1)**.
2. Save the database password somewhere safe.
3. Open **SQL Editor** → **New query**. Paste the entire contents of
   `supabase/schema.sql` and press **Run**. It should finish with "Success".
4. Go to **Authentication → Sign In / Providers → Email** and turn
   **Confirm email** *off*. Your team then signs up and can log in straight away —
   they still see nothing until you approve them, so this costs you no security.
   (Leave it on if you'd rather everyone verify their address first; they'll just
   need to click the emailed link before their first sign-in.)
5. Go to **Project Settings → API** and copy two values:
   - **Project URL**
   - **anon public** key

The anon key is safe to expose in the browser. Every table is protected by
row-level security, so what a person can read is decided by Postgres, not by the UI.
**Never** put the `service_role` key in this project.

## 2. Put the code on GitHub

```bash
cd maaef-directory
git init
git add .
git commit -m "UP Irrigation directory"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/maaef-directory.git
git push -u origin main
```

## 3. Deploy on Vercel

1. vercel.com → **Add New → Project** → import the repo.
2. Framework preset: **Next.js**. Leave build settings alone.
3. Under **Environment Variables** add both, for all environments:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon public key |

4. **Deploy**. You'll get a URL like `maaef-directory.vercel.app`.
5. Back in Supabase → **Authentication → URL Configuration**, set
   **Site URL** to that Vercel URL and add it under **Redirect URLs**.

## 4. Claim the superadmin account

**Do this immediately after the first deploy, before sharing the link.**

Open the site, choose **Create account**, and sign up with your own email.
The first account ever created becomes **superadmin** automatically. Every
account after that starts as `pending` with no access.

If you get this wrong, fix it in Supabase → **Table Editor → profiles** by
editing the `role` column directly.

## 5. Let your team in

1. Send them the URL. They create their own account with their own password.
2. They land on a "waiting for approval" screen.
3. You open **Users**, set each person's role, and for viewers add the zones,
   circles or districts they're allowed to see.

A viewer with no grants sees an empty directory. To give someone the whole
state, grant them the Head Office.

## 6. Bring your prototype data across

In the single-file prototype, press **Export backup** to download the JSON.
In the deployed app go to **Entry → Import backup**, paste the file contents,
and press Import. Run this once — it adds records rather than replacing them.

---

## Running it locally

```bash
npm install
cp .env.example .env.local     # then fill in your two values
npm run dev                    # http://localhost:3000
```

For local sign-in to work, add `http://localhost:3000` to the Supabase
redirect URL list alongside the Vercel URL.

## Where things live

```
supabase/schema.sql          tables, security policies, signup trigger
middleware.js                keeps the login session fresh
lib/supabase/                browser and server clients
app/login                    sign in / create account
app/pending                  holding screen for unapproved accounts
app/dashboard                read-only directory
app/entry                    the same directory, with editing on
app/users                    role and access management
app/search                   global search across every field
app/changes                  the change log, superadmin only
lib/directory.js             office levels and the shared text helpers
lib/search.js                the matching behind the search page
components/DirectoryApp.jsx  tree, department cards, people, history, dialogs
components/UsersAdmin.jsx    the users table
components/SearchApp.jsx     the search page
components/ChangeLog.jsx     the change log and its revert buttons
```

## Notes on the data model

- A **department card** is one sanctioned post. The official phone number lives
  here and never moves, so a transfer leaves the office number untouched.
- An **employee card** is a person. They attach to a post, move between posts,
  or sit on the **bench** attached to nothing.
- Two people with the same designation cannot hold one department card. The rule
  is skipped when designation is blank, since it has nothing to compare.
- Every posting writes a row in `postings` with a from date, and closes the
  previous row with a to date. Post titles and office paths are copied into that
  row, so history survives an office or post being deleted later.
- A department card can be **moved to any other office** — Bareilly District to
  Lucknow Circle, or anywhere else — with the ⇢ button on the card. It takes its
  official number and whoever holds it, because people attach to the post rather
  than to the office. You are asked which kind of move it is:
  - *recorded in the wrong place* — the current posting is corrected to the new
    office and closed postings are left alone, since those are still true;
  - *the post has actually moved* — the current posting is closed at the old
    office on a date you give and reopened at the new one, so the service record
    shows the officer at both places.
- **Wings** (Civil, E&M, Revenue, or your own) tag an office so the parallel
  branches under a tubewell division group separately instead of interleaving.

## Security worth knowing

- Viewers can only read people who are currently posted inside their scope.
  Benched people are hidden from them, because a benched person belongs to no office.
- Deleting an office cascades to its children and their department cards.
  Anyone on those posts is moved to the bench first, so no person record is lost.
- Admins and superadmins can create, edit and delete department cards and employee
  cards. Deleting an employee card also deletes that person's posting history.
- Only a superadmin can change roles, grant access, rename an office, or delete an office.
- Only a superadmin can read the change log or revert anything.

## Search

One box, everything at once. A query is matched against a person's name, their
personal number, a position's title and its official number, office names, the
level of an office, and the notes on people and posts. Results come back in
three sections — people, positions, offices — each saying which field matched,
so a number that turns up under "office no." is not mistaken for a personal one.

- **People with the same name** are gathered under one heading, each line showing
  the post held and the office it sits in. That is what tells two officers of the
  same name apart.
- **Searching a position** lists both the position itself and everyone holding it,
  anywhere in the department.
- **Phone numbers match on digits alone**, so `0522-262 0000`, `05222620000` and
  `262 0000` all find the same post. Queries shorter than three digits are treated
  as names rather than numbers.
- **The location filter** narrows everything to one office and all the offices
  beneath it. People on the bench sit in no office, so a location filter excludes
  them.
- **Vacant positions only** is there for filling gaps.

An office matches on its own name and level, not on the names of its ancestors —
otherwise searching a zone would list every office beneath it. Use the location
filter for that.

The quick box in the top bar is still the fastest way to jump to something you can
name; it stops at 24 results and ends with a link into the full search.

## Operations that must not half-happen

Posting somebody, benching them, moving a card and deleting a card or an office
each need several writes that only make sense together — close the old term,
move the person, open the new term. Run from the browser as separate calls, a
dropped connection half way through leaves a person on a post with no open
posting, or an office deleted with its people still attached to cards that no
longer exist.

Each of these is now a single database function, so it is a single transaction:
all of it happens or none of it does.

| Function | What it does |
|---|---|
| `assign_employee(emp, post, on_date)` | closes the open term, moves the person, opens the new term |
| `bench_employee(emp, on_date)` | closes the open term and takes the person off their post |
| `move_post(post, dest, corrected, on_date)` | moves a card and fixes up every affected service record |
| `delete_post(post, on_date)` | benches the holders, then removes the card |
| `delete_office(office, on_date)` | benches everyone below, then removes the office and its children |

Two things fall out of this. The one-holder rule on a named card is now enforced
by the database rather than only by the UI, so two admins acting at the same
moment cannot both fill the same post. And because a whole operation is one
transaction, the change log records it as **one action** — a transfer is a single
revertible entry rather than three unrelated rows, and deleting an office with
everything under it comes back in one click.

The functions are security invoker, so row level security still applies to every
statement inside them and they can never become a way round it. The `is_editor()`
check on top of each is there to fail with a clear message rather than silently
write nothing.

**Still not atomic:** *Entry → Import backup* writes its rows one at a time, so a
failure part way through leaves a partly-imported directory. It is a one-off
migration tool from the prototype rather than day-to-day use, and the change log
now records everything it does.

## The change log

Postgres triggers record every insert, update and delete on offices, department
cards, people, postings, wings, roles and access grants. The log is written by
the database, not by the app, so a change cannot avoid it by going round the UI —
and nothing but the trigger can write to `audit_log`, so it cannot be edited after
the fact.

**Revert** puts one record back the way it was: an edit gets its old values, a
deletion comes back with its original id, a creation is removed again. Changes
made by a single action — deleting an office takes its children and their cards
with it — share a transaction id, so they group together and can be undone in one
go, newest first, so parents return before the rows that point at them. A revert
is itself a change, so it appears in the log too.

Two things it will refuse rather than guess: undoing an edit to a record that has
since been deleted, and any revert in a group where one step fails — the whole
group rolls back and nothing changes.

## Upgrading an existing project

`supabase/schema.sql` is safe to re-run: paste the whole file into the SQL Editor
again to pick up the change log without touching the data you already have.
