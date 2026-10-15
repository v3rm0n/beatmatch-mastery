# Beatmatch mastery

Webapp for practicing beatmatching. Works best with a MIDI controller, but can be used without.

## Development

Use Node.js 20.19+ or 22.12+ (including newer releases).

```sh
npm ci
npm run dev
```

The first dev/build run downloads Mixxx controller mappings, so it requires Git and network access. Later runs reuse `public/controllers`. The app runs at http://localhost:8080.

```sh
npm test            # Regression tests
npm run lint       # Check formatting and lint without changing files
npm run lint:fix   # Apply formatting and safe lint fixes
npm run typecheck
npm run build      # Generate mappings, check types, and build production assets
```

The UI targets Safari 16.4+, Chrome 111+, and Firefox 128+ with [Tailwind CSS 4](https://tailwindcss.com/docs/upgrade-guide#browser-requirements).

MIDI access needs browser permission and a secure context (HTTPS or localhost). On-screen controls work without a controller. The mapping adapter implements a subset of Mixxx's scripting API; complex controller scripts may need additional support. Mapping failures appear in the MIDI panel.

## Thanks to

- [Lovable](https://lovable.dev/) for getting the project bootstrapped very fast
- [Mixxx](https://github.com/mixxxdj/mixxx) for DJ controller MIDI mappings
- [djcontroller.js](https://github.com/fwcd/djcontroller.js) for showing how to use those mappings
- [web-808](https://github.com/ggyshay/web-808) for instruments
