import type { CustomMatcher, MatcherResult } from 'bun:test'
import { afterAll, beforeAll } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BunPlugin } from 'bun'
import chalk from 'chalk'
import debug from 'debug'
import { decode } from 'he'
import type { ReactElement } from 'react'

import { name as pkgName } from '../package.json' with { type: 'json' }
import type { BunOptions } from '../types/bun.ts'
import { env } from './env.ts'
import { basename, mkdtemp as mkdtempDisposable } from './fs.ts'
import type { Builder, IOptions, ScreenshotDiff } from './lib.ts'
import { optionsSchema, screenshot } from './lib.ts'
import { newPool } from './pool.ts'

const log: debug.Debugger = debug(`${pkgName}:bun`)

let diffDir: string = ''

beforeAll(async () => {
  diffDir = await mkdtemp(join(tmpdir(), `${pkgName}-`))
})

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

const msgLine = (r: ScreenshotDiff, msg: string): string =>
  `${[r.state, r.idx].join('.').padEnd(10, ' ')}: ${msg}`

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
    const callOpts = optionsSchema.parse(rawOpts ?? {})
    const opts = { ...globalOpts, ...callOpts }
    const plugins = opts.plugins ?? []

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

    const results = await screenshot(
      element as ReactElement | string,
      name,
      builder(plugins),
      pool,
      opts,
    )

    const matchResults = await Promise.all(
      results.map(async r => {
        if (!r.before) {
          return {
            message: msgLine(
              r,
              'No screenshot to compare against, generated one',
            ),
            pass: true,
          }
        }

        if (r.identical) {
          return {
            message: msgLine(r, 'Screenshots matched'),
            pass: true,
          }
        }

        const diffPath = join(
          diffDir,
          basename(name, { variant: r.state, idx: r.idx }),
        )

        if (r.diff) await writeFile(diffPath, r.diff)

        return {
          message: msgLine(
            r,
            `Screenshots did not match. If this was expected, set SPOTCHECK_UPDATE=true. Visual diff written to:\n\t${diffPath}`,
          ),
          pass: false,
        }
      }),
    )

    return {
      pass: matchResults.every(m => m.pass),
      message: () =>
        matchResults.reduce((msg, r) => {
          const fn = r.pass ? chalk.green : chalk.red
          const line = fn(r.message)

          return `${msg}\n${line}`
        }, `Screenshot comparison for "${name}" failed:`),
    }
  }
}
