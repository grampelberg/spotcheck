import fs from 'node:fs/promises'
import { join } from 'node:path'

import debug from 'debug'
import type { Pool } from 'generic-pool'
import type { Browser, ElementHandle, Page } from 'puppeteer'
import type { ReactElement } from 'react'
import ReactDOMServer from 'react-dom/server'
import { z } from 'zod'

import { name as pkgName } from '../package.json' with { type: 'json' }
import { visualDiff } from './diff.ts'
import { basename, dirname } from './fs.ts'
import { acquire } from './pool.ts'

const log: debug.Debugger = debug(`${pkgName}:lib`)

const allStates: string[] = ['default', 'active', 'focus', 'hover']

export { allStates as __allStates }

// biome-ignore lint/nursery/useExplicitType: zod
const stateSchema = z.enum(allStates)
type IState = z.infer<typeof stateSchema>

// biome-ignore lint/nursery/useExplicitType: zod
export const optionsSchema = z.object({
  css: z
    .array(z.string())
    .optional()
    .describe(
      `CSS fiels to include in the build. These should be paths to files.`,
    ),
  path: z
    .string()
    .default('__screenshots__')
    .describe(
      `Directory to save the screenshots. Defaults to __screenshots__ next to
the test file.`,
    ),
  update: z
    .boolean()
    .default(false)
    .describe(`If true, will update the screenshots. Defaults to false.`),
  states: z
    .array(stateSchema)
    .default(allStates)
    .describe(`Each state to gather a screenshot for. Defaults to all states.`),
})

export type IOptions = z.input<typeof optionsSchema>
type OOptions = z.output<typeof optionsSchema>

export type Builder = (index: string, css?: string[]) => Promise<string[]>

export interface ScreenshotDiff {
  state: IState
  idx: number
  before?: ArrayBufferView
  after: ArrayBufferView
  diff?: Buffer
  identical: boolean
}

type HandlerFn = (p: Page, e: ElementHandle<Element>) => Promise<void>

const stateHandlers: Map<string, HandlerFn> = new Map([
  [
    'active',
    async (p: Page, e: ElementHandle<Element>): Promise<void> => {
      await e.hover()
      await p.mouse.down()
    },
  ],
  ['default', async (): Promise<void> => {}],
  [
    'focus',
    async (p: Page, e: ElementHandle<Element>): Promise<void> => {
      await e.focus()
      // Move the mouse off the element (which might be at 0,0) to avoid hover
      await p.mouse.move(-1, -1)
    },
  ],
  [
    'hover',
    async (_: Page, e: ElementHandle<Element>): Promise<void> => e.hover(),
  ],
])

const resetInput = async (p: Page): Promise<void> => {
  await p.mouse.reset()

  // For some reason, when `mouse.down` is called, *something* happens to the
  // focus that results in subsequent screenshots missing the default focus
  // border. Pressing tab and then blurring the active element resets the
  // state so that there aren't oddities in future runs. While it would be
  // ideal to just render everything in its own page to skip this unfortunate
  // reset problem, that adds ~100ms per screenshot.
  await p.keyboard.press('Tab')
  await p.evaluate(() => {
    ;(document.activeElement as HTMLElement)?.blur()
  })
}

const captureElement = async (
  page: Page,
  state: string,
  el: ElementHandle<Element>,
): Promise<Uint8Array<ArrayBufferLike>> => {
  await stateHandlers.get(state)?.(page, el)

  const img = await el.screenshot()
  await resetInput(page)

  return img
}

const render = (element: string, css?: string[]): string =>
  `<html lang="en">
  <head>${css?.join('\n')}</head>
  <body>
    ${element}
  </html>
  `

export const screenshot = async (
  element: ReactElement | string,
  name: string,
  builder: Builder,
  pool: Pool<Browser>,
  rawOpts: IOptions = {},
): Promise<ScreenshotDiff[]> => {
  if (typeof element !== 'string')
    element = ReactDOMServer.renderToString(element)

  log('capturing screenshot', { name })

  const opts: OOptions = optionsSchema.parse(rawOpts)

  const html = render(element)

  const css = (opts.css ? await builder(html, opts.css) : []).map(
    txt => `<style>${txt}</style>`,
  )

  await using ctx = await acquire(pool)
  const browser = ctx.browser

  log('browser attached', { name })

  const page = await browser.newPage()

  page.on('console', msg => log('page console.log', msg.text()))

  const content = render(element, css)
  await page.setContent(content)

  // Cancel all animations to avoid rendering differences. `cancel()` is used
  // instead of `finish()` as some animations have infinite duration.
  await page.evaluate(() => {
    for (const anim of document.getAnimations()) {
      anim.cancel()
    }
  })

  const allChildren = await page.$$('body > *')
  const children = await allChildren.reduce(async (p, el) => {
    const acc = await p

    const { width, height } = (await el.boundingBox()) ?? {
      width: 0,
      height: 0,
    }
    if (width !== 0 && height !== 0) acc.push(el)

    return acc
  }, Promise.resolve<ElementHandle<Element>[]>([]))

  if (children.length === 0)
    throw new Error(`No elements found for "${name}":\n${content}`)

  const pngLoc = dirname(opts.path)
  await fs.mkdir(pngLoc, { recursive: true })

  // page interactions require the page to be focused, so we can't do this in a
  // single browser in parallel. It would be possible to open a new browser for
  // each state, but that takes ~750ms for each new browser. Setting content on
  // a page takes ~100ms. To keep things speedy, we're doing some basic resets
  // for input and using a single browser/page for everything.
  return await opts.states.reduce(async (p, state) => {
    const acc = await p

    for (const [idx, e] of children.entries()) {
      const after = await captureElement(page, state, e)

      const pngPath = join(pngLoc, basename(name, { variant: state, idx }))

      const before = await fs.readFile(pngPath).catch(() => null)

      if (opts.update || !before) await fs.writeFile(pngPath, after)

      if (!before || opts.update) {
        acc.push({ state, idx, after, identical: true })
      } else {
        const { img, identical } = await visualDiff(before, Buffer.from(after))

        acc.push({
          state,
          idx,
          before,
          after,
          diff: img,
          identical,
        })
      }
    }

    log('screenshot', { name, update: opts.update, state })

    return acc
  }, Promise.resolve<ScreenshotDiff[]>([]))
}
