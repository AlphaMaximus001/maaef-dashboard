# The Wall

A private link board for Maaef Media House. You paste a link, it goes up as a card,
and everyone let in can talk about it underneath — typed notes, voice notes,
screenshots. Hover a card and it tells you who put it there and when.

This is a **standalone app with its own database**. It has nothing to do with the
UP Irrigation directory and shares no code, no tables and no Supabase project with it.

- **Login** — sign in, or request access.
- **Wall** — everything pinned, newest first. Paste a link into the bar at the top.
- **Users** — approve people, close accounts. Admins and the owner only.

Roles: `pending` → `member` → `admin` → `owner`.
A `pending` account sees nothing at all. `member` can pin, comment, and delete
their own things. `admin` can additionally let people in and take down anyone's card.
`owner` is the first account ever created and cannot be unseated by an admin.

---

## 1. Create the Supabase project

1. supabase.com → **New project**. Region: **Mumbai (ap-south-1)**.
   Make a *new* project — do not reuse the directory's.
2. Save the database password somewhere safe.
3. **SQL Editor → New query**. Paste the whole of `supabase/schema.sql` and **Run**.
   That creates the tables, the security policies, the storage bucket and the
   signup trigger. It should finish with "Success".
4. **Authentication → Sign In / Providers → Email**: turn **Confirm email** *off*.
   People can then sign up and sign in straight away — they still see nothing until
   you approve them, so this costs you no security.
5. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

The anon key is meant to be public. Every table is guarded by row-level security,
so what a person can read, write and delete is decided by Postgres, not by the UI.
**Never** put the `service_role` key in this project.

## 2. Put the code on GitHub

```bash
cd maaef-wall
git init
git add .
git commit -m "The Wall"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/maaef-wall.git
git push -u origin main
```

## 3. Deploy on Vercel

1. vercel.com → **Add New → Project** → import this repo.
2. Framework preset: **Next.js**. Leave the build settings alone.
3. Under **Environment Variables** add both, for all environments:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon public key |

4. **Deploy**.
5. Back in Supabase → **Authentication → URL Configuration**, set **Site URL** to
   the Vercel URL and add it under **Redirect URLs**.

## 4. Claim the owner account

**Do this immediately after the first deploy, before you send anyone the link.**

Open the site, choose **Request access**, and sign up with your own email.
The first account ever created becomes **owner** automatically. Everything after
that starts as `pending` with no access.

If you get this wrong, fix it in Supabase → **Table Editor → profiles** by editing
the `role` column directly.

## 5. Let people in

1. Send them the URL. They make their own account with their own password.
2. They land on a "not yet" screen and can see nothing.
3. You open **Users** and press **Let them in**. That is it.

To lock someone out later, press **Close account**. They are shut out on the next
request and every query they make starts failing at the database. Nothing they
pinned is deleted — press **Reopen** to undo it.

---

## Using it

**Pin a link.** Paste into the bar at the top and press Enter. Pasting a bare URL
into an empty bar fires straight away without pressing anything. The server reads
the page for its title, description and preview image, and copies them into the
card so it still reads properly years later when the far end has changed or died.

**Say something.** Click a card. The drawer on the right holds the whole thread.

- Type a note and press **Add** (or Ctrl/Cmd + Enter).
- Press **Voice** to record off your microphone. You hear it back before it goes up,
  and can scrap it.
- Press **Shot** to attach a screenshot — or just paste one from the clipboard, or
  drag an image onto the composer.
- A screenshot or voice note can carry a caption. It goes up as one note.

**Delete.** Hover anything you put up and a ✕ appears in the corner; click twice to
confirm. You will not see one on other people's cards, because you cannot delete
them — that is enforced by the database, not by hiding the button. Admins see one
on everything.

**Hover a card** to see who pinned it, how long ago, and the exact timestamp.

## Running it locally

```bash
npm install
cp .env.example .env.local     # then fill in your two values
npm run dev                    # http://localhost:3000
```

Add `http://localhost:3000` to the Supabase redirect URL list alongside the
Vercel URL, or local sign-in will not work.

## Where things live

```
supabase/schema.sql       tables, security policies, storage bucket, signup trigger
middleware.js             keeps the login session fresh
lib/supabase/             browser and server clients, plus the one gate function
lib/unfurl.js             reads a pasted page for its title, image and description
app/login                 sign in / request access
app/pending, app/banned   holding screens
app/wall                  the board
app/admin                 the user panel
app/api/unfurl            server side link reader
components/Wall.jsx       paste bar, grid, live updates
components/LinkBox.jsx    one card, and the hover credit
components/LinkDrawer.jsx the thread and the composer
components/Users.jsx      the user panel
```

## Security worth knowing

- **Deleting is enforced in Postgres.** The delete policy on `links` and `notes` is
  `created_by = auth.uid() or is_admin()`. Someone hitting the API directly with
  their own token still cannot remove your card.
- **Voice notes and screenshots are in a private bucket.** Nothing is served from a
  public URL. The app hands out signed links that expire after an hour, and only to
  people who are currently let in. Every file is filed under the uploader's user id,
  which is what makes "delete your own files, not other people's" enforceable on the
  storage side too.
- **A closed account fails at the database.** Banning is not a UI flag — `is_active()`
  returns false and every policy that depends on it stops matching, so the account
  reads nothing even with a valid session cookie.
- **The user panel cannot be turned against you.** A trigger on `profiles` stops an
  admin editing the owner's row, stops anyone but the owner handing out the owner
  role, and stops people banning themselves.
- **The link reader cannot be pointed inward.** `/api/unfurl` fetches a URL from
  inside our own network on the caller's behalf, which is the classic shape of a
  server-side request forgery. It is closed to anyone not signed in and let in, and
  it refuses loopback, private, link-local and cloud-metadata addresses — on every
  redirect hop, not just the first. Response bodies are capped at 512 KB.
- **Anyone let in can read the roster** (names and emails of other members). They
  have to be able to, since every card and note is credited to a person by name.

## Notes on the data model

- A card keeps its own copy of the title, description and image. Nothing is fetched
  from the far end again after the moment you pin it.
- A note is one of three kinds: `text`, `voice` or `shot`. Voice and shot point at a
  file in the `wall` bucket; text does not. All three can carry a body, so a
  screenshot with a caption is a single note rather than two.
- Deleting a card cascades to its notes in the database. The app clears the attached
  files out of storage first, since those would not cascade on their own.
