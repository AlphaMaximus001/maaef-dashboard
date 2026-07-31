# UP Irrigation Posting Directory

Internal directory for Maaef Enterprises. Tracks which officer sits on which sanctioned
post across the department hierarchy, and keeps the posting history of every person.

- **Dashboard** — read-only. Everyone who is let in lands here.
- **Entry** — create and edit offices, department cards and people. Admin and superadmin only.
- **Users** — approve sign-ups, set roles, grant per-office access. Superadmin only.

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
components/DirectoryApp.jsx  tree, department cards, people, history, dialogs
components/UsersAdmin.jsx    the users table
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
- **Wings** (Civil, E&M, Revenue, or your own) tag an office so the parallel
  branches under a tubewell division group separately instead of interleaving.

## Security worth knowing

- Viewers can only read people who are currently posted inside their scope.
  Benched people are hidden from them, because a benched person belongs to no office.
- Deleting an office cascades to its children and their department cards.
  Anyone on those posts is moved to the bench first, so no person record is lost.
- Only a superadmin can change roles, grant access, delete offices or delete people.
