import type { CustomMatcher, MatcherResult } from 'bun:test'
import { afterAll } from 'bun:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BunPlugin } from 'bun'
import chalk from 'chalk'
import debug from 'debug'
import { decode } from 'he'
import type { ReactElement } from 'react'
import z from 'zod'

import { name as pkgName } from '../package.json' with { type: 'json' }
import { env } from './env.ts'
import { mkdtemp as mkdtempDisposable } from './fs.ts'
import type { Builder, IOptions } from './lib.ts'
import { optionsSchema, platforms, screenshot } from './lib.ts'
import { newPool, optSchema as poolOpt } from './pool.ts'

const log: debug.Debugger = debug(`${pkgName}:bun`)

// biome-ignore lint/nursery/useExplicitType: zod
export const bunOptionsSchema = optionsSchema.extend({
  plugins: z
    .array(z.any())
    .optional()
    .describe(`Bun plugins required to build the test cases.`),
  pool: poolOpt.default({ max: 10, preserveBrowser: false }),
  platforms,
})

export type BunOptions = z.input<typeof bunOptionsSchema>

const builder =
  (plugins: BunPlugin[]): Builder =>
  async (index: string, css?: string[]): Promise<string[]> => {
    await using loc = await mkdtempDisposable(join(tmpdir(), 'screenshot-'))
    const indexPath = join(loc.path, 'index.html')
    await Bun.file(indexPath).write(decode(index))

    const build = await Bun.build({
      entrypoints: [indexPath, ...(css ?? [])],
      outdir: join(loc.path, 'dist'),
      naming: '[name]-[hash].[ext]',
      plugins,
    })

    if (!build.success) {
      throw new Error(`Build failed:\n${build.logs}`)
    }

    return await Promise.all(
      build.outputs
        .filter(f => f.path.endsWith('.css'))
        .map(async f => await Bun.file(f.path).text()),
    )
  }

export const toMatchScreenshot = (
  globalOpts?: BunOptions,
): CustomMatcher<unknown, [string]> => {
  let pool = newPool(globalOpts?.pool)
  let isDrained = false

  afterAll(async () => {
    // TODO: this is a hack until [23113](https://github.com/oven-sh/bun/pull/23113)
    // is released.
    isDrained = true

    await pool.drain()
    await pool.clear()
  })

  return async (
    element: unknown,
    // Can go away once bun implements `expect.getState`
    name: string,
    rawOpts?: IOptions,
  ): Promise<MatcherResult> => {
    const opts = bunOptionsSchema.parse({ ...globalOpts, ...rawOpts })
    opts.update = rawOpts?.update ?? env().SPOTCHECK_UPDATE

    log(`taking screenshot for "${name}":`, opts)

    // TODO: this is a hack, see above
    if (isDrained) {
      pool = newPool(globalOpts?.pool)
      isDrained = false
    }

    if (element === window.document) {
      element = (element as Document).body.outerHTML
    }

    const results = (
      await screenshot(
        element as ReactElement | string,
        name,
        builder(opts.plugins as BunPlugin[]),
        pool,
        opts,
      )
    ).filter(r => opts.platforms.includes(r.platform))

    if (!results.some(o => o.changed)) {
      return {
        message: () => `Content has not changed.`,
        pass: true,
      }
    }

    return {
      message: () => {
        let msg = `Content has changed. If this is on purpose, re-run with
SPOTCHECK_UPDATE=true. Would update ${process.platform}.`

        for (const r of results) {
          const changed = r.changed ? 'changed' : 'unchanged'
          const updated = r.updated ? 'updated' : 'not updated'
          const color = r.changed && !r.updated ? chalk.red : chalk.white
          const line = color(`${changed}, ${updated}`)

          msg += `\n${r.platform.padEnd(8)}: ${line}`
        }

        return msg
      },
      pass: results.every(o => !o.changed || o.updated),
    }
  }
}
