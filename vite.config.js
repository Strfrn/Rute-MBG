import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

// Plugin untuk membaca/menulis data.json langsung dari dev server
function dataApiPlugin() {
  const dataPath = path.resolve('./public/data/data.json')
  return {
    name: 'data-api',
    configureServer(server) {
      // GET /api/data → baca data.json
      server.middlewares.use('/api/data', (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const content = fs.readFileSync(dataPath, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(content)
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Gagal membaca data.json' }))
          }
          return
        }
        // POST /api/data → tulis data.json
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body)
              fs.writeFileSync(dataPath, JSON.stringify(parsed, null, 2), 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch (e) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'JSON tidak valid' }))
            }
          })
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dataApiPlugin()],
})
