import 'bun:test'

declare module 'bun:test' {
  interface Matchers<T> {
    toMatchScreenshot(name: string, opts?: BunOptions): Promise<T>
  }
  interface AsymmetricMatchers {
    toMatchScreenshot(name: string, opts?: BunOptions): void
  }
}
