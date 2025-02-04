import { resolve } from 'path'
import * as vite from 'vite'
import { createVuePlugin } from 'vite-plugin-vue2'
import PluginLegacy from '@vitejs/plugin-legacy'
import consola from 'consola'
import { jsxPlugin } from './plugins/jsx'
import { replace } from './plugins/replace'
import { ViteBuildContext, ViteOptions } from './types'

export async function buildClient (ctx: ViteBuildContext) {
  const alias = {}
  for (const p of ctx.builder.plugins) {
    alias[p.name] = p.mode === 'server'
      ? `defaultexport:${resolve(ctx.nuxt.options.buildDir, 'empty.js')}`
      : `defaultexport:${p.src}`
  }

  // redirect '/_nuxt' to buildDir for dev
  if (ctx.nuxt.options.dev) {
    alias['/_nuxt'] = ctx.nuxt.options.buildDir
  }

  const clientConfig: vite.InlineConfig = vite.mergeConfig(ctx.config, {
    define: {
      'process.server': false,
      'process.client': true,
      'process.static': false,
      global: 'window',
      'module.hot': false
    },
    cacheDir: resolve(ctx.nuxt.options.rootDir, 'node_modules/.cache/vite/client'),
    resolve: {
      alias
    },
    build: {
      outDir: resolve(ctx.nuxt.options.buildDir, 'dist/client'),
      assetsDir: '.',
      rollupOptions: {
        input: resolve(ctx.nuxt.options.buildDir, 'client.js')
      },
      manifest: true,
      ssrManifest: true
    },
    plugins: [
      replace({ 'process.env': 'import.meta.env' }),
      jsxPlugin(),
      createVuePlugin(ctx.config.vue),
      PluginLegacy()
    ],
    server: {
      middlewareMode: true
    }
  } as ViteOptions)

  await ctx.nuxt.callHook('vite:extendConfig', clientConfig, { isClient: true, isServer: false })

  // Production build
  if (!ctx.nuxt.options.dev) {
    const start = Date.now()
    consola.info('Building client...')
    await vite.build(clientConfig)
    consola.success(`Client built in ${Date.now() - start}ms`)
    return
  }

  // Create development server
  const viteServer = await vite.createServer(clientConfig)
  await ctx.nuxt.callHook('vite:serverCreated', viteServer)

  const viteMiddleware = (req, res, next) => {
    // Workaround: vite devmiddleware modifies req.url
    const originalURL = req.url
    viteServer.middlewares.handle(req, res, (err) => {
      req.url = originalURL
      next(err)
    })
  }
  await ctx.nuxt.callHook('server:devMiddleware', viteMiddleware)

  ctx.nuxt.hook('close', async () => {
    await viteServer.close()
  })
}
