import type { Pool } from 'generic-pool'
import genericPool from 'generic-pool'
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer'
import { z } from 'zod'

import { env } from './env.ts'

const launchArgs: LaunchOptions = env().GITHUB_ACTIONS
  ? {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
  : {}

// biome-ignore lint/nursery/useExplicitType: zod
const optSchema = z.object({
  max: z
    .number()
    .min(1)
    .default(10)
    .describe('Maximum number of browsers to spawn'),
  preserveBrowser: z
    .boolean()
    .default(false)
    .describe('Preserve browsers after use'),
})

export type PoolOptions = z.input<typeof optSchema>
type OOptions = z.output<typeof optSchema>

export const newPool = (rawOpts?: PoolOptions): genericPool.Pool<Browser> => {
  const opts: OOptions = optSchema.parse(rawOpts ?? {})
  opts.preserveBrowser = rawOpts?.preserveBrowser ?? env().SPOTCHECK_PRESERVE

  const factory = {
    create: (): Promise<Browser> =>
      puppeteer.launch({ headless: !opts.preserveBrowser, ...launchArgs }),
    destroy: (browser: Browser): Promise<void> => {
      if (!opts.preserveBrowser) return browser.close()
      return Promise.resolve()
    },
  }

  return genericPool.createPool(factory, { min: 1, max: opts.max })
}

interface DisposableBrowser {
  browser: Browser
  release: () => Promise<void>
  [Symbol.asyncDispose]: () => Promise<void>
}

export const acquire = async (
  pool: Pool<Browser>,
): Promise<DisposableBrowser> => {
  const browser = await pool.acquire()

  const release = async (): Promise<void> => await pool.release(browser)

  return {
    browser,
    release,
    async [Symbol.asyncDispose](): Promise<void> {
      release()
    },
  }
}
