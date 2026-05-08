// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { unpluginFactory } from '../src/index'
import type { Options } from '../src/types'

const entryId = '/virtual/fixtures/basic.tsx'
const fixtureCode = `
  import { createApp } from 'essor'

  function Foo() {
    return <div>Foo</div>
  }

  function App() {
    return <Foo />
  }

  createApp(App, '#root')
`

function transformFixture({
  nodeEnv,
  options,
  framework = 'rollup',
  command,
}: {
  nodeEnv?: string
  options?: Options
  framework?: 'rollup' | 'vite'
  command?: 'build' | 'serve'
}) {
  const previousNodeEnv = process.env.NODE_ENV

  if (nodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = nodeEnv
  }

  try {
    const plugin = unpluginFactory(options, { framework } as never)

    if (framework === 'vite' && command) {
      plugin.vite?.configResolved?.({ command })
    }

    const result = plugin.transform?.call({}, fixtureCode, entryId)
    if (!result) {
      return ''
    }

    return typeof result === 'string' ? result : result.code
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }
}

function expectHmrEnabled(code: string) {
  expect(code).toContain('virtual:essor-hmr')
  expect(code).toContain('createHMRComponent')
  expect(code).toContain('__hmrId')
}

function expectHmrDisabled(code: string) {
  expect(code).not.toContain('virtual:essor-hmr')
  expect(code).not.toContain('createHMRComponent')
  expect(code).not.toContain('__hmrId')
}

describe('unplugin hmr mode', () => {
  it('enables hmr by default in development', () => {
    const code = transformFixture({
      nodeEnv: 'development',
    })

    expectHmrEnabled(code)
  })

  it('disables hmr by default in production', () => {
    const code = transformFixture({
      nodeEnv: 'production',
    })

    expectHmrDisabled(code)
  })

  it('disables hmr when the option is explicitly false', () => {
    const code = transformFixture({
      nodeEnv: 'development',
      options: {
        hmr: false,
      },
    })

    expectHmrDisabled(code)
  })

  it('uses vite command to override NODE_ENV for serve and build', () => {
    const serveCode = transformFixture({
      nodeEnv: 'production',
      framework: 'vite',
      command: 'serve',
    })
    const buildCode = transformFixture({
      nodeEnv: 'development',
      framework: 'vite',
      command: 'build',
      options: {
        hmr: true,
      },
    })

    expectHmrEnabled(serveCode)
    expectHmrDisabled(buildCode)
  })
})
