# CI Treasure Hunt — Website

A global directory of Contact Improvisation events, communities, venues, and teachers.

Built with Next.js, Tailwind CSS, and Supabase.

---

## What it is

- **Event calendar** — festivals, intensives, workshops, jams worldwide
- **Community directory** — CI communities with layered access to private chat groups
- **Teacher & venue profiles** — live

Live at [citreasurehunt.com](https://citreasurehunt.com) — event calendar, community directory, and
teacher/venue profiles for the international Contact Improvisation scene. Organizers can submit and
manage their own events; filter by discipline, country, or month, and search by city or keyword.

Join the community: [Telegram group](https://t.me/citreasurehunt) ·
[Telegram announcement channel](https://t.me/citreasurelist)

---

## Stack

| Layer | Tool |
|-------|------|
| Frontend | Next.js (App Router) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | Supabase (PostgreSQL, eu-central-1) |
| Auth | Supabase Auth (emailed link + six-digit code, or Sign in with Google) |
| Hosting | Vercel |

---

## Local development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
