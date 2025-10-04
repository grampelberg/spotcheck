import { z } from 'zod'

// biome-ignore lint/nursery/useExplicitType: zod
const envBool = z.preprocess(val => {
  if (val === 'true' || val === 1 || val === 'yes') return true
  if (val === '' || val === 'false' || val === 0 || val === 'no') return false
  throw new Error(`Invalid boolean value: ${val}`)
}, z.boolean())

// biome-ignore lint/nursery/useExplicitType: zod
const settingsSchema = z.object({
  SPOTCHECK_PRESERVE: envBool.default(false),
  SPOTCHECK_UPDATE: envBool.default(false),
  TEST_CLEAN: envBool.default(true),
})

export type Env = z.infer<typeof settingsSchema>

export const env = (): Env => settingsSchema.parse(process.env)
