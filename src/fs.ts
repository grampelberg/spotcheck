import type { EncodingOption } from 'node:fs'
import fs from 'node:fs/promises'
import path, { join } from 'node:path'

import callsites from 'callsites'

interface MkdtempResult {
  path: string
  remove: () => Promise<void>
  [Symbol.asyncDispose]: () => Promise<void>
}

export const mkdtemp = async (
  prefix: string,
  options?: EncodingOption,
): Promise<MkdtempResult> => {
  const path = await fs.mkdtemp(prefix, options)

  const remove = async (): Promise<void> => {
    await fs.rmdir(path, {
      maxRetries: 0,
      recursive: true,
      retryDelay: 0,
    })
  }

  return {
    path,
    remove,
    async [Symbol.asyncDispose](): Promise<void> {
      await remove()
    },
  }
}

export const dirname = (loc: string): string => {
  // TODO: util.getCallSites() would be the best way to go about this.
  // Unfortunately, bun has not implemented it yet. For now, this assumes that
  // it is being run from within bun:test.
  const stack = callsites()

  const top = stack
    .slice()
    .reverse()
    .find(s => s.getFileName())
  if (!top) throw new Error('Could not determine caller')

  return join(path.dirname(top.getFileName() as string), loc)
}

export const basename = (
  name: string,
  { idx, variant }: { idx?: number; variant?: string },
): string => {
  let fname = encodeURIComponent(name)
  if (idx !== undefined) fname += `.${idx}`
  if (variant) fname += `.${variant}`
  fname += '.png'
  return fname
}
