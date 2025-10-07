import { expect } from 'bun:test'

import { toMatchScreenshot } from '@grampelberg/spotcheck/bun'
import bunPluginTailwind from 'bun-plugin-tailwind'

// @ts-expect-error
import cssPath from './src/index.css'

expect.extend({
  toMatchScreenshot: toMatchScreenshot({
    plugins: [bunPluginTailwind],
    css: [cssPath],
    platforms: ['darwin'],
  }),
})
