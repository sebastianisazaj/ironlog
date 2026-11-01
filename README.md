# IronLog

Gym tracker PWA — English / Español. Installable on iPhone and Android, works offline.

- 876 exercises with photos and instructions from the open-source [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain), names translated to Spanish
- Programs for beginner, intermediate and expert, plus a **workout builder** (pick muscles for today, supersets/biseries, or plan your week)
- Set logging with rest timer, automatic PR detection, progressive-overload hints, charts, streaks, XP ranks and achievements
- Exercise alternatives when your gym lacks a machine
- Light / dark / auto theme, kg / lb
- All data stays in the browser (localStorage); export/import JSON backups

## Run

**Static (any host, e.g. GitHub Pages):** serve the `public/` folder. The included workflow `.github/workflows/pages.yml` publishes it on every push to `main`.

**LAN server (adds sync between devices on your network):**

```bash
node server.js
```

Then open the "Other devices" URL it prints from your phone.

## Install on your phone

- **Android (Chrome):** open the site → *Install app*.
- **iPhone (Safari):** open the site → Share → *Add to Home Screen*.

## Credits

Exercise data and photos: [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense). Some icons adapted from [Lucide](https://lucide.dev) (ISC).
