import type { IOptions, ScreenshotOptions } from '../src/lib.tsx'
import type { PoolOptions } from '../src/pool.ts'

declare module 'bun:test' {
  interface Matchers<T> {
    toMatchScreenshot(name: string, opts?: ScreenshotOptions): Promise<T>
  }
  interface AsymmetricMatchers {
    toMatchScreenshot(name: string, opts?: ScreenshotOptions): void
  }
}

export interface BunOptions extends IOptions {
  // Plugins required to build the test cases, tailwind is a common one.
  plugins?: BunPlugin[]
  pool?: PoolOptions
}
