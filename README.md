# 澳洲华人网球会 (ACTC) website

Jekyll site hosted on GitHub Pages at https://actc.org.au. Based on the [Clean Blog](https://github.com/IronSummitMedia/startbootstrap-clean-blog-jekyll) theme (Bootstrap 3).

## Local preview

```
bundle install
bundle exec jekyll serve
```

## Layout

- `index.md` - current year's competition page
- `20xx/` - per-year registration, draws, ticket pages
- `_posts/` - events listed under `/others/`
- `history/` - past results
- `_data/sponsors.yml` - all sponsors and where they appear (footer, media, side banners); edit this for yearly updates
- `img/` - images (sponsor logos in `img/sponsors/`)

## Assets

`npm install`, then `npm run build` (Grunt) minifies `js/clean-blog.js` and compiles `less/clean-blog.less`. Requires Node 18+.

Note: the committed `css/clean-blog.css` has been edited by hand and no longer matches what `less/` compiles to. Running the build overwrites it, so review the visual diff first.