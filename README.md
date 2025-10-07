# Spotcheck

Preview the design of your components as part of a pull request. Check out an
[example][example-pr] PR for what it could look like in your repo. Spotcheck:

[example-pr]:
  https://github.com/grampelberg/spotcheck/pull/2/files#diff-6ef306e868de1c171e746195bbf9d18d9c703e14900ee8f2c16bd34229177aa9

- Renders and screenshots your components as part of your unit tests.
- Interacts with each component to capture the major interaction states (active,
  focus, hover).
- Fails tests when content has changed but screenshots haven't been updated.
- Works cross-platform.

Spotcheck works at the component level, not the page. You can get a preview of
any part of the UI - from the smallest button up to a full page. By capturing
the individual interactive states of components, such as `:active` or `:hover`,
reviewing changes becomes simpler and helps to make sure nothing falls through
the cracks.

## Interaction States

By default, spotcheck captures a set of states for each element. It is possible
to limit these in configuration for those that aren't visually different from
the `default` state. These are:

- `:active` - The mouse is positioned over the element and the mouse button is
  pressed. This results in a combination of `:active`, `:hover` and `:focus`
  being applied.

- `:focus` - The element has `.focus()` called on it. This should be equivalent
  to a user hitting `tab` on their keyboard. The mouse is _not_ positioned over
  the element, so `:hover` is not applied.

- `:hover` - The mouse is positioned over the midpoint of the element, but no
  buttons are pressed.

Note: the states are triggered at the top level of the element. This emulates
someone interacting with that directly. If you have nested elements, such as
buttons you'll want to test those directly to see their individuals states. For
group states, check out tailwind's
[group](https://tailwindcss.com/docs/hover-focus-and-other-states#styling-based-on-the-descendants-of-a-group).

## Repo Setup

You'll want to check the \*.png files generated in, make sure that they're
included in LFS:

```bash
git lfs track "*.png"
```

## Bun

Once setup, you'll be able to use the `toMatchScreenshot` matcher:

```ts
expect(<div />).toMatchScreenshot('test component')
```

If you're using a virtual DOM (like happy-dom), you can pass either the global
document (or just a string if you'd like to handle the rendering yourself):

```ts
expect(document).toMatchScreenshot("test component");
```

Check out the [example](./examples/bun) if you'd like to see something fully
working.

### Setup

To use spotcheck with bun, you'll need to modify three files:

- `spotcheck.ts` to add the `toMatchScreenshot` matcher and set your global
  settings.
- `bunfig.toml` to load `spotcheck.ts` before any tests run.
- `tsconfig.json` to add the types.

First off, create a file called `spotcheck.ts`. This will extend the available
matchers to add `toMatchScreenshot`. This example assumes that you're using the
tailwind plugin and have an `index.css` file.

```ts
import { expect } from "bun:test";
import bunPluginTailwind from "bun-plugin-tailwind";
import { toMatchScreenshot } from "@grampelberg/spotcheck/bun";

import cssPath from "@/index.css";

expect.extend({ toMatchScreenshot: toMatchScreenshot({
  plugins: [bunPluginTailwind],
  css: [cssPath]
}});
```

All the options set here are global but can be overridden on a per-call basis.
Check out the [options](#options) section for more details.

Next up, modify `bunfig.toml` to load `spotcheck.ts` before any tests run.

```toml
[test]
preload = ["./spotcheck.ts"]
```

Finally, add the types to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@grampelberg/spotcheck/bun"]
  }
}
```

### Options

These work both globally (as shown above) and on a per-call basis:

```ts
{
  // An optional list of plugins to use during build. This is where
  // bun-plugin-tailwind will go.
  plugins: [],
  // To make this faster, puppeteer browsers are pooled.
  pool: {
    // Max number of browsers to allow launched. Tweak this if you're running
    // things concurrently.
    max: 10,
    // Run the browser in head-full mode and keep it around after the test.
    // This is helpful for debugging.
    preserveBrowser: false,
  },
  // Whether or not to allow missing screenshots. If true, tests will pass if
  // there is no before version for a screenshot.
  allowMissing: true,
  // An optional list of css files to include. This will be passed directly to
  // the builder and for bun, should be the path to your CSS files.
  css: [],
  // The path to store screenshots. This should be checked into git.
  path: '__screenshots__',
  // Whether or not to update the screenshots.
  update: false,
  // The different states to capture. To reduce noise, if you're not planning
  // on having one of these states - disable it. The value can be a subset of:
  states: ['active', 'default', 'focus', 'hover'],
  // The different platforms to ensure are up to date. If you only care about
  // screenshots for darwin, set to `['darwin']`.
  platforms: ['darwin', 'linux', 'win32']
}
```

### Updating Screenshots

To update screenshots, set `SPOTCHECK_UPDATE=true`.

### Debugging

You can preserve the browser used for screenshots by setting
`SPOTCHECK_PRESERVE=true`.

## Cross Platform Rendering

Platforms have their own rendering engines, resulting in subtle differences in
the screenshots. For example, fonts on Linux have lower weights than on macOS.
Spotcheck keeps track of the platform by adding its name to the screenshot's
path. Instead of tracking pixel level differences, spotcheck saves a hash of the
markup + css used to render the screenshot. It then returns if that has changed
since the last screenshot. In the case of `toMatchScreenshot`, the test will
fail, ensuring that the screenshots are updated before merging.

## Tradeoffs

- When triggering interactions and then taking a screenshot, positioning of
  elements is based on how the markup was rendered. For example, if you're using
  popper implementations and happy-dom, the popper is always rendered at the
  top-left of the page because positioning isn't calculated.
- We don't record any animations. When the elements are loaded, the animations
  are actively canceled.

## Development

Run the tests with:

```bash
just test::run
```

To prepare for a PR, run:

```bash
just ci
```

- [debug](https://www.npmjs.com/package/debug) is used for logging.

## Supported Environments

If your environment isn't listed here, you can still use the core by integrating
directly with `screenshot`. That said, we'd love to have more environments
supported. Please open an issue or PR if you'd like to help out.

- [x] Bun
- [ ] Jest
- [ ] Vitest
- [ ] esbuild
