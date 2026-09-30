# 澳洲华人网球会 (ACTC) website

Jekyll site hosted on GitHub Pages at https://actc.org.au. Plain HTML/CSS/JS design (no framework); light and dark themes; mobile first.

## Local preview

```
bundle install
bundle exec jekyll serve
```

## Yearly update

Edit `_data/tournament.yml` only: title, dates, venue, fees, categories, registration open/close times and the rules text. The home page (hero, countdown, event cards, timeline, rules) is generated from it, and the countdown and "registration open / closed / running / finished" states switch automatically by date. When a registration page or link exists, put it in `registration.url` and the buttons appear.

## Layout

- `index.md` - home page (layout `home`); anything written in its body appears as an "announcements" section
- `20xx/` - per-year schedules, draws, ticket pages (keep the URLs)
- `_posts/` - events listed under `/others/` (cards with the first image and an excerpt)
- `history/` - past reports; add a report and one line in `_data/history.yml` and it shows on `/history/` (filterable)
- `_data/sponsors.yml` - sponsors shown above the footer on every page
- `_layouts/` - `home`, `page` (set `wide: true` for full width), `post`; `_includes/` - header, footer, sponsors, rules, icons
- `css/actc.css` - the site design; `css/compat.css` - keeps old page markup (grid, tables, carousels) working; `js/site.js` - navigation, theme toggle, countdown, tabs, lightbox
- `img/` - images (sponsor logos in `img/sponsors/`)

## Legacy files

The old Clean Blog / Bootstrap 3 assets (`less/`, `Gruntfile.js`, `package.json`, `css/bootstrap*`, `css/clean-blog.css`, `js/bootstrap*`, `js/jquery*`, `js/clean-blog*`, `stylesheets/`, `fonts/`) are no longer loaded by any page and can be deleted.