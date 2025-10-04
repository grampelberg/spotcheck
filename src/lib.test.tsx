import { afterAll, describe, expect, mock, test } from 'bun:test'
import { readdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { fileURLToPath } from 'bun'
import debug from 'debug'
import type { Pool } from 'generic-pool'
import type { Browser } from 'puppeteer'
import type { ReactElement } from 'react'

import { name } from '../package.json' with { type: 'json' }
import { env } from './env.ts'
import {
  __allStates,
  type Builder,
  type ScreenshotDiff,
  screenshot,
} from './lib.ts'
import { newPool } from './pool.ts'

// biome-ignore lint/correctness/noUnusedVariables: used in debug
const log: debug.Debugger = debug(`${name}:test:lib`)

const __dirname: string = dirname(fileURLToPath(import.meta.url))

const identicalResults = (results: ScreenshotDiff[]): void => {
  expect(results.every(r => r.identical)).toBe(true)
  expect(results.map(r => r.state)).toEqual(expect.arrayContaining(__allStates))
  expect(results.every(r => r.before)).toBeDefined()
  expect(results.every(r => r.diff)).toBeDefined()
}

const mtime = async (path: string): Promise<number> => {
  const { mtime } = await stat(path)
  return mtime.getTime()
}

describe('screenshot', async () => {
  const pool = newPool({ preserveBrowser: env().SPOTCHECK_PRESERVE })
  const css = ['* { margin: 0 }']
  const builder = async (): Promise<string[]> => css
  const opts = {
    update: env().SPOTCHECK_UPDATE,
  }
  const tmpPath = '__tmp__'
  const tmpDir = join(__dirname, tmpPath)

  if (env().TEST_CLEAN)
    afterAll(async () => await rm(tmpDir, { recursive: true, force: true }))

  test("doesn't call builder when there's no css", async () => {
    const mockBuilder = mock(builder)

    await screenshot(<div>Hello</div>, 'hello-nocss', mockBuilder, pool, {
      path: tmpPath,
    })

    expect(mockBuilder).not.toHaveBeenCalled()
  })

  describe.serial('works for JSX', async () => {
    const cssPaths = ['foobar', 'baz']
    const mockBuilder = mock(builder)

    const results = await screenshot(
      <div>Hello</div>,
      'hello',
      mockBuilder,
      pool,
      {
        css: cssPaths,
        ...opts,
      },
    )

    test('builder was called correctly', async () => {
      expect(mockBuilder).toHaveBeenCalledTimes(1)
      const call = mockBuilder.mock.calls[0] as [string, string[]] | undefined
      if (!call) throw new Error('Builder was not called')

      expect(call[0]).toEqual(expect.stringContaining('<html'))

      expect(call[0]).not.toContain('<style>')
      expect(call[1]).toEqual(expect.arrayContaining(cssPaths))

      expect(mockBuilder.mock.results[0]?.value).resolves.toEqual(
        expect.arrayContaining(css),
      )
    })

    test('results are correct', async () => {
      identicalResults(results)
    })
  })

  test('works for strings', async () => {
    const results = await screenshot(
      '<div>Hello</div>',
      'hello-str',
      builder,
      pool,
      { css: ['foobar'], ...opts },
    )

    identicalResults(results)
  })

  test.serial('throws when nothing is rendered', async () => {
    expect(async () =>
      screenshot('', 'hello-empty', builder, pool),
    ).toThrowErrorMatchingSnapshot()
  })

  test('injects css', async () => {
    const el = <div>Hello</div>
    const name = 'hello-css'
    const cssOpts = {
      states: ['default'],
      css: ['foobar'],
      path: '__tmp__',
    }
    await screenshot(el, name, async () => [], pool, cssOpts)

    const results = await screenshot(
      el,
      name,
      async () => ['* { color: white }'],
      pool,
      cssOpts,
    )

    expect(results.every(r => r.identical)).toBe(false)
  })

  describe.serial('file handling', async () => {
    const name = 'hello-path'
    const states = ['active', 'hover']
    const args: [ReactElement, string, Builder, Pool<Browser>] = [
      <>
        <div>Foo</div>
        <div>Bar</div>
      </>,
      name,
      builder,
      pool,
    ]
    const fileOpts = {
      states,
      path: tmpPath,
    }

    await screenshot(...args, fileOpts)

    const files = await readdir(tmpDir)
    const stateFiles = files.filter(n => n.includes(name))

    // Also tests writing files when none exist
    test('places screenshots where configured', async () => {
      expect(files.some(n => n.includes(name))).toBe(true)
    })

    test('only collects the states configured', async () => {
      expect(
        states.every(str => stateFiles.some(file => file.includes(str))),
      ).toBe(true)
    })

    test('takes a screenshot for each element', async () => {
      const elementIndex = ['0', '1']

      expect(
        elementIndex.every(str => stateFiles.some(file => file.includes(str))),
      ).toBe(true)
    })
  })

  test('updates screenshots when configured', async () => {
    const name = 'hello-update'
    const args: [ReactElement, string, Builder, Pool<Browser>] = [
      <div>Foo</div>,
      name,
      builder,
      pool,
    ]
    const fileOpts = {
      states: ['default'],
      path: tmpPath,
    }

    await screenshot(...args, fileOpts)

    const fname = (await readdir(tmpDir)).find(f => f.includes(name))

    expect(fname).toBeDefined()

    const fpath = join(tmpDir, fname as string)

    const startMtime = await mtime(fpath)

    await screenshot(...args, fileOpts)

    expect(startMtime).toBe(await mtime(fpath))

    await screenshot(...args, { ...fileOpts, update: true })
    expect(startMtime).toBeLessThan(await mtime(fpath))
  })

  describe('interaction reset', async () => {
    const name = 'hello-reset'
    const css = `
      * { background: blue }
      button:hover { background: red }
      button:active { border: 5px solid green }
      button:focus { color: white }
      `

    const args: [ReactElement, string, Builder, Pool<Browser>] = [
      <button type="button">Foo</button>,
      name,
      async (): Promise<string[]> => [css],
      pool,
    ]
    const fileOpts = {
      css: ['foobar'],
      path: tmpPath,
    }

    await screenshot(...args, fileOpts)

    test.each(__allStates)('%s is the same', async state => {
      const results = await screenshot(...args, {
        ...fileOpts,
        states: [state],
      })

      expect(results.every(r => r.identical)).toBe(true)
    })
  })

  test("doesn't wait for long animations", async () => {
    const name = 'hello-anim'
    const plain = `* { margin: 0; }`
    const animated = `
      * {
        margin: 0;
        opacity: 1;
        animation: fadeIn 1s ease-in forwards;
      }

      @keyframes fadeIn {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }`
    const el = <div>foo</div>
    const animOpts = {
      css: ['foobar'],
      states: ['default'],
      path: tmpPath,
    }

    await screenshot(el, name, async () => [plain], pool, animOpts)

    const results = await screenshot(el, name, async () => [animated], pool, {
      ...animOpts,
    })

    expect(results.every(r => r.identical)).toBe(true)
  })

  // doesn't leak browser instances
  // has the correct visual elements
})
