# Synoptic Skies — TODO

## Bugs / UX Issues

- [ ] **Satellite image slow to appear on scroll** — the 1200x1200 GOES image is large and lazy-loaded, so it pops in late when you scroll down. Consider preloading it, using a smaller image, or adding a placeholder/skeleton.
- [ ] **Glossary hover not visible when scrolled** — if you hover a highlighted term in the AFD but the glossary widget is scrolled out of view, you never see the definition. The glossary box needs to be sticky or pinned so it's always visible while reading.
- [ ] **Current conditions widget takes up too much sidebar space** — the full widget (humidity, pressure, visibility, station) pushes more useful stuff down. Slim it down to the essentials: temp, conditions, wind, dewpoint.

## Layout Changes

- [ ] **Reorder sidebar:** Glossary (pinned/sticky) > Satellite > Current Conditions (compact) > Forecast > Forecaster card
- [ ] **Make glossary widget sticky** — pin it to the top of the sidebar so it's always visible as the user reads and hovers terms in the AFD
- [ ] **Compact current conditions** — condense to a slim inline display: temp, conditions, wind, dewpoint. Drop or collapse the rest (humidity, pressure, visibility, station) behind an "expand" toggle.

## Content — About AFD Page

- [ ] **Add WFO map to the About page** — use the NWS WFO map SVG (from Wikipedia: `NWS_Weather_Forecast_Offices.svg`) to show the 122 WFOs across the US. Most people have no idea their area has a dedicated forecast office. Embed it in or near the "The Forecasters" section.
- [ ] **Explain what a WFO actually does** — expand the Forecasters section or add a new "Your Weather Forecast Office" section. Cover: these are real buildings with real people. They launch weather balloons (radiosondes) twice daily, operate Doppler radars, issue local warnings, and write the AFDs. They're the backbone of the US weather enterprise.
- [ ] **Add a "Why I Built This" section** at the bottom of the about page. Personal story: lifelong weather nerd, 4 consecutive elementary school science fair projects on weather, built backyard weather stations from scratch, first job out of grad school at NOAA working with NWS to secure federal funds for critical weather operations. The AFD brings the voice of fellow weather enthusiasts to the public — this site exists to make that voice more accessible.

## Content — Main Page / WFO Context

- [ ] **Show WFO area on location select** — when a user enters a location, display a cropped/highlighted outline of their WFO's coverage area. Give people a visual sense of "this is the region your forecaster is writing about." Could be a small inset map next to the header or in the sidebar.
- [ ] **WFO info blurb** — show a brief note like "Your forecast is written by the NWS office in Monterey, CA (WFO MTR)" with a link to the About page. Many users won't know what a WFO is or that a real person wrote their forecast.

## Features — PWA / Mobile

- [ ] **Add a web app manifest** (`manifest.json`) — app name, icons, theme color, `display: standalone` so it feels like a native app when bookmarked on a phone
- [ ] **Add a service worker** — cache the app shell (HTML/CSS/JS) for fast repeat loads; optionally cache the last-fetched AFD for offline reading
- [ ] **Add `<meta name="apple-mobile-web-app-capable">` tags** for iOS home screen support
- [ ] **Test and polish mobile layout** — sidebar should stack below main content on narrow screens; ensure touch targets are big enough; glossary hover behavior needs a tap-friendly alternative on mobile

## Features — General

- [ ] **Write a README.md** — project description, screenshot, tech stack, how to run locally, how to deploy. Important for the portfolio angle.
- [ ] **Add OpenGraph / social meta tags** — so sharing the link on Twitter/LinkedIn/Discord shows a nice preview card with a screenshot or the site icon
- [ ] **Geolocation prompt** — offer to detect the user's location automatically (with permission) instead of requiring manual zip/city input
- [ ] **Remember last location more visibly** — the app saves to localStorage, but the input field could show a "Using saved location: Denver, CO" hint on load
- [ ] **Improve error states** — when the NWS API is down (which happens), show a friendlier message and maybe offer to show the cached version
- [ ] **Loading skeletons** — replace the plain "Loading..." text with skeleton/shimmer placeholders for a more polished feel
- [ ] **Accessibility pass** — check color contrast in both themes, screen reader flow, keyboard navigation through collapsible sections
- [ ] **Temperature unit toggle** — let users switch between Fahrenheit and Celsius
- [ ] **Print stylesheet** — a clean print layout for people who want to save or print an AFD (weather nerds do this)
- [ ] **"What changed" diff** — highlight what's new or different compared to the previous AFD issuance, so returning users can quickly see what shifted in the forecast

## Code Quality

- [ ] **Add a `.env.example` file** — document the required `ANTHROPIC_API_KEY` env var so others (or future you) know what's needed for the AI summary feature
- [ ] **Deduplicate `escapeHTML`** — it's defined in both `app.js` and `afd-parser.js`; extract to a shared utility
- [ ] **Consider a CSS-only approach for glossary on mobile** — since hover doesn't work on touch, maybe show definitions as a tooltip/popover on tap

## Stretch / Someday

- [ ] **Animated satellite loop** — cycle through recent GOES images instead of a single still frame
- [ ] **Radar widget** — embed NWS radar imagery for the user's area
- [ ] **Historical AFDs** — let users browse previous forecast discussions, not just the latest
- [ ] **Notification opt-in** — alert users when a new AFD is issued or when watches/warnings are posted for their area
- [ ] **Shareable summary links** — let users share "The Gist" summary with a permalink
- [ ] **Model comparison view** — when the AFD mentions GFS vs Euro disagreement, visualize that (someday...)
- [ ] **Sounding data** — link to or display the upper-air sounding from the WFO's radiosonde launch (ties into the "what does a WFO do" educational angle)
