import { expect } from 'bun:test'

import { toMatchScreenshot } from '@grampelberg/spotcheck/bun'
import bunPluginTailwind from 'bun-plugin-tailwind'

import cssPath from './index.css'

expect.extend({
  toMatchScreenshot: toMatchScreenshot({
    plugins: [bunPluginTailwind],
    css: [cssPath],
  }),
})
