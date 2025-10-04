# Spotcheck

Preview the design of your components as part of a pull request. Spotcheck:

- Renders and screenshots your components as part of your unit tests.
- Interacts with each component to capture the major interaction states (active,
  focus, hover).
- Compares the screenshots to what's checked in and shows a diff if things
  change.

This all works at the component level. You can spotcheck any part of the UI -
from the smallest button up to a full page. By capturing the different states of
your components, you can understand how a particular change impacts the design.
For many changes, you no longer need to ask the author for a set of screenshots
or run things yourself just to see how interactions work.

## states

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

## Setup

You'll want to check the \*.png files generated in, make sure that they're
included in LFS:

```bash
git lfs track "*.png"
```

## Bun

To use with bun, you'll want to run `expect.extend()` as part of preload. To set
this up, first create a file called `test-preload.ts`:

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

Note: you can set these options either globally here, or on a per-call basis.

Then, edit `bunfig.toml` to include:

```toml
[test]
preload = ["./test-preload.ts"]
```

Now, you'll be able to use `toMatchScreenshot` in your tests:

```ts
expect(<div />).toMatchScreenshot('test component')
```

If you're using a virtual DOM (like happy-dom), you can pass a string instead:

```ts
expect(document.body.outerHTML).toMatchScreenshot("test component");
```

Check out the [example](./examples/bun) for something that works.

### Updating Screenshots

To update screenshots, set `SPOTCHECK_UPDATE=true`.

### Debugging

You can preserve the browser used for screenshots by setting
`SPOTCHECK_PRESERVE=true`.

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

## Oddities

- `getPath` is going to be framework specific. `util.getCallSites()` works in
  node (for specific versions) but doesn't for bun.
- The build itself needs to be different depending on which bundler is being
  used.
