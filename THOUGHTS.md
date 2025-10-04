# Thoughts

- How should screenshots be named?

  The naming needs to be stable. Ideally, this would be based off the test names
  automatically. Jest and vitest both have something akin to `expect.getState()`
  which lets you construct that name from inside an assertion. Unfortunately,
  bun has not implemented this yet. To make it easier to support multiple test
  runners, the `screenshot` function is agnostic and allows the test runner to
  put it together. There can be a separate export for each test runner.

- Is there a way to introspect what test/define/it combo is currently being
  used?

  `expect.getState()` seems to work with jest and vitest. There doesn't appear
  to be a stable way to do it with bun. A separate way to do this would be via
  `util.getCallSites()` but that is node specific currently.

- How do snapshots get stored?

  We create a `__screenshots__` directory next to the test file. This is
  configurable if you want to put it somewhere else.

- It is taking ~1s to get a screenshot, that's 5x slower than running a bunch of
  tests against a virtual DOM and a real component. Where's the bottleneck?

  Naively, it appears that the `puppeteer.launch()` call is expensive. We'll
  memoize this so that it only happens once.

- The builders need to be pluggable. what's the best way to do that? Note:
  they'll need configuration (aka plugins) to do the build, so it'll be a
  require _some_ config (probably) for every case.

- Interactions seem important. I don't want to run all the javascript (that's
  starting to feel like re-duplicating stuff). Maybe things like :hover are good
  enough?

  Sticking to the
  [CSS specific states](https://tailwindcss.com/docs/hover-focus-and-other-states)
  for now. I'm not sure the complexity is worth the value of going deeper.

- How can we show diffs in the PRs?

  There's a weird timing interaction here. You want to update the snapshots at
  commit time so that CI passes. That, unfortunately, erases the _old_ image
  that could be used for the diff.

  Would it be possible to save the image as an asset for previous builds and
  look it up after the fact?

  Maybe even better, would it be possible to pull the image from the target
  branch and diff _that_ instead of whatever the previous commit was?

- How do optional dependencies work with package.json?

- Pixelmatch requires images to be identical sizes. I'm scoping the image to the
  element itself right now. It'd be possible to use a fixed size, but I'm not
  sure that'll solve the problem. If the images are different sizes, they're
  clearly different. Maybe stitch the images together to show them side by side
  for the diff

  We assume that if they're different sizes, they're different. Then, there's no
  need to actually do the diff. Just show them side by side.

- Now that states are being added, it kinda feels like there should be generated
  tests for each state ala variant tests. That would look great and simplify the
  expect.toMatchScreenshot() call. Unfortunately, bun has very specific nesting
  rules now. You can nest describe() but not test(). This would change the
  `screenshot()` API and require users to only call this from `describe()`
  blocks which feels particularly onerous.

  For now, we'll stick to doing it all inside a `CustomMatcher` and see how it
  feels. `vitest` might open up some extra possibilities and have it make sense
  to change the API around.

- `brwoser.close()` can't be disposed of inside `screenshot()` as it is testing
  framework agnostic. It _can_ be inside the CustomMatcher, theoretically.
  Unfortunately, bun doesn't allow it because of how the nesting is happening.
  We could:
  - Use a try/finally block inside `screenshot()`.
  - Delegate creation/cleanup of the `browser` to the test runner itself.
  - Do something fancy with memoization and disposal (it'll result in a top
    level await ...)

- What happens when elements are larger than the viewport?

- Is it important to test dark vs light mode?

- What's the best way to do debugging? I keep toggling `browser.close()` and
  `headless: true`

  Maybe the best would be implementing a way to "preserve" the browser. That
  lets the user close it themselves. Unfortunately, this doesn't address
  changing the interactions as it is all done in the same page.

- How can we add titles to the screenshots? `sharp` can only really tile things
  effectively. With big images, that results in huge titles.

  For now, we'll skip titles. It'll help quite a bit, however, during review as
  you don't have to figure it out from the filename.

- It seems that page creation is expensive. Is there a way to reuse pages
  effectively? Maybe a page pool?

  Pages are actually super cheap (looks like ~5ms or so). The expensive part is
  creating the borwser (~750ms) and adding the markup (~100ms). There's the
  added problem that you can't do much with pages in parallel as interactions
  require the page to be active.

- Do the fancy language features `{ type: "json" }` break in other runtimes?

  There's a whole bunch of random language features that are being used here
  which might not work on older systems. Need to test.

- I've gotten a couple timeouts taking screenshots, especially when after
  restarting. Is this just going to be a thing?

  I've only seen this once, might not be a major issue.

- Performance:
  - It takes ~700ms to start the browser. Probably worth memoizing this. Is
    there a way to cache a browser instance between test runs themselves? `bun`
    restarts the process entirely each time.

  - Pages can't be interacted with serially, this results in everything being
    serial. Creating a page, setting the content and interacting takes ~150ms.
    While there's a benefit to having each interaction as a separate page for
    debugging, I'm not convinced it is worth the cost. Is it possible to reuse
    the page effectively?
    - newPage() is ~100ms
    - setContent() is ~5ms
    - screenshot() is ~50ms

    Page and content can be parallel. Interaction and screenshot needs to be
    serial (inside the same browser).

  - Does it make sense to spin up browsers in parallel? This would _probably_
    slow the initial startup down and speed up the marginal page interaction
    time itself.

- It seems that `@testing-library/react` fundamentally requires tests to be run
  in serial with a global document. That's unfortunate. While this means that
  normal tests and snapshots are going to be in serial, it still should be
  possible to run screenshots in parallel.

- How should this handle random text? The pixel diff is going to fail, that's
  unfortunate.

  For now, we're assuming you don't use random text. Maybe that'll change in the
  future, but it is far too difficult to normalize.

- ~Every call requires the same settings. What's the best way to set these
  globally? As part of the `expect.extend()` call?

  Added global options that can be overridden on a per-call basis.

- If you're using a virtual dom, it is likely that you'll have all the markup in
  `document`. Should there be an `expect` that works directly with that?

  It feels a little weird to do `expect.toMatchScreenshot()`, so for bun, we can
  take a document, string or element. The `screenshot()` signature takes either
  strings or eleements to make things simpler there.

- Bun runs `afterAll` after each test file. This makes it awkward to drain the
  pool as it'll be draining when the next file is called. What kind of resources
  are leaking in this case? Is it okay to just leave the browser instances
  running?

  It is not okay, those browsers keep running in the background. Bun also
  doesn't fire any `process.on` events when it exists (in testing). Until the
  `afterAll` bug is fixed, the pool just gets drained for every file.
