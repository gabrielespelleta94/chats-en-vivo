import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Chat, Estado, Fila, Vista } from '../types'

// Rutas bajo la carpeta del usuario; se rellenan en session.start (ver rutas()).
// Latidos de los chats con el mod cargado (dan la herramienta en curso)
let DIR = ''
// Ficha de cada chat de la app de escritorio: título, id de la CLI, archivado
let SESIONES = ''
// Transcripciones: si se han escrito hace poco, el chat está trabajando
let PROYECTOS = ''

async function rutas($: EngineInterface) {
  const home = ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/')
  DIR = `${home}/.claude/chats-en-vivo`
  SESIONES = `${home}/AppData/Roaming/Claude/claude-code-sessions`
  PROYECTOS = `${home}/.claude/projects`
}
const PANE = 'chats-en-vivo'
const ACTIVO_MS = 20_000 // transcripción tocada hace menos de esto = trabajando
const VENTANA_MS = 48 * 3_600_000 // chats con actividad en los últimos 2 días
const MAX_FILAS = 40

type Ficha = {
  sessionId: string
  cliSessionId?: string
  title?: string
  cwd?: string
  isArchived?: boolean
  lastActivityAt?: number
}

const vista = atom({ plugin: 'chats-en-vivo', key: 'vista' } as const, { filas: [], ahora: 0 })

let yo: Chat | undefined
// Caché de fichas por ruta y fecha, y de dónde vive cada transcripción
const fichas = new Map<string, { mtime: number; ficha: Ficha | undefined }>()
let transcripciones = new Map<string, string>()
let mapaHecho = 0

const carpetaDe = (ruta: string) => ruta.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? ruta

async function escribir($: EngineInterface, cambio: Partial<Chat>) {
  if (!yo) return
  yo = { ...yo, ...cambio, actualizado: await $.clock.now() }
  await $.fs.write(`${DIR}/${yo.id}.json`, JSON.stringify(yo))
}

async function leerJson($: EngineInterface, ruta: string): Promise<unknown> {
  const texto = await $.fs.read(ruta).catch(() => '')
  try {
    return JSON.parse(String(texto))
  } catch {
    return undefined
  }
}

async function mapearTranscripciones($: EngineInterface, ahora: number) {
  if (ahora - mapaHecho < 60_000) return
  mapaHecho = ahora
  const nuevo = new Map<string, string>()
  for (const d of await $.fs.list(PROYECTOS).catch(() => [])) {
    if (d.kind !== 'dir') continue
    for (const f of await $.fs.list(`${PROYECTOS}/${d.name}`).catch(() => [])) {
      if (f.kind === 'file' && f.name.endsWith('.jsonl')) {
        nuevo.set(f.name.slice(0, -6), `${PROYECTOS}/${d.name}/${f.name}`)
      }
    }
  }
  transcripciones = nuevo
}

async function leerFichas($: EngineInterface): Promise<Ficha[]> {
  const res: Ficha[] = []
  for (const cuenta of await $.fs.list(SESIONES).catch(() => [])) {
    if (cuenta.kind !== 'dir') continue
    for (const org of await $.fs.list(`${SESIONES}/${cuenta.name}`).catch(() => [])) {
      if (org.kind !== 'dir') continue
      const base = `${SESIONES}/${cuenta.name}/${org.name}`
      for (const f of await $.fs.list(base).catch(() => [])) {
        if (f.kind !== 'file' || !f.name.startsWith('local_') || !f.name.endsWith('.json')) continue
        const ruta = `${base}/${f.name}`
        let hit = fichas.get(ruta)
        if (!hit || hit.mtime !== f.mtimeMs) {
          hit = { mtime: f.mtimeMs, ficha: (await leerJson($, ruta)) as Ficha | undefined }
          fichas.set(ruta, hit)
        }
        if (hit.ficha) res.push(hit.ficha)
      }
    }
  }
  return res
}

async function refrescar($: EngineInterface) {
  const ahora = await $.clock.now()
  await mapearTranscripciones($, ahora)

  const latidos = new Map<string, Chat>()
  for (const f of await $.fs.list(DIR).catch(() => [])) {
    if (f.kind !== 'file' || !f.name.endsWith('.json')) continue
    const c = (await leerJson($, `${DIR}/${f.name}`)) as Chat | undefined
    if (c) latidos.set(c.id, c)
  }

  const filas: Fila[] = []
  for (const s of await leerFichas($)) {
    if (s.isArchived || !s.cliSessionId) continue
    let tocado = 0
    const ruta = transcripciones.get(s.cliSessionId)
    if (ruta) tocado = (await $.fs.stat(ruta).catch(() => undefined))?.mtimeMs ?? 0
    const ultima = Math.max(tocado, s.lastActivityAt ?? 0)
    if (ahora - ultima > VENTANA_MS) continue

    const latido = latidos.get(s.cliSessionId)
    let estado: Estado = ahora - tocado < ACTIVO_MS ? 'pensando' : 'libre'
    let herramienta = ''
    let desde = ultima
    if (latido && latido.estado !== 'cerrada' && latido.estado !== 'libre') {
      estado = latido.estado
      herramienta = latido.herramienta
      desde = latido.inicioTurno
    }
    filas.push({
      id: s.sessionId,
      titulo: s.title || 'Sin título',
      carpeta: carpetaDe(s.cwd ?? ''),
      link: `claude://claude.ai/epitaxy/${s.sessionId}`,
      estado,
      herramienta,
      desde,
      esEste: s.cliSessionId === yo?.id,
    })
  }

  const peso = (f: Fila) => (f.estado === 'libre' ? 1 : 0)
  filas.sort((a, b) => peso(a) - peso(b) || b.desde - a.desde)
  await update($, vista, (): Vista => ({ filas: filas.slice(0, MAX_FILAS), ahora }))
}

async function abrir($: EngineInterface, link: string, titulo: string) {
  $.ui.toast(`Abriendo «${titulo}»…`)
  // rundll32 entrega el enlace claude:// a la app en ~2 s; explorer.exe tardaba más de 20
  await $.process.run(['rundll32.exe', 'url.dll,FileProtocolHandler', link]).catch(() => undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await rutas($)
    const id = await $.session.id()
    const cwd = await $.session.cwd()
    yo = {
      id,
      carpeta: carpetaDe(cwd),
      prompt: '',
      estado: 'libre',
      herramienta: '',
      herramientas: 0,
      inicioTurno: 0,
      actualizado: 0,
    }
    await escribir($, {})
    await $.command.register({ name: 'chats', description: 'Abre el panel de chats en vivo' })
    $.clock.every(3000, () => void refrescar($))
    void refrescar($)
    void $.ui.open({ id: PANE, title: 'Chats en vivo' })
    return next(e)
  })

  on('command.run', { command: 'chats' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Chats en vivo' })
    return { text: 'Panel de chats abierto.' }
  })

  on('turn.start', async ($, e, next) => {
    const texto = e.text.replace(/\s+/g, ' ').trim()
    await escribir($, {
      estado: 'pensando',
      herramienta: '',
      herramientas: 0,
      inicioTurno: await $.clock.now(),
      ...(texto ? { prompt: texto.slice(0, 80) } : {}),
    })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) {
      await escribir($, { estado: 'herramienta', herramienta: e.tool, herramientas: (yo?.herramientas ?? 0) + 1 })
    }
    const res = await next(e)
    if (e.agentId === undefined && yo?.estado === 'herramienta') {
      await escribir($, { estado: 'pensando', herramienta: '' })
    }
    return res
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await escribir($, { estado: 'libre', herramienta: '' })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await escribir($, { estado: 'cerrada' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const v = await read($, vista)
    const activos = v.filas.filter(f => f.estado !== 'libre').length

    const reloj = (ms: number) => {
      const s = Math.max(0, Math.floor(ms / 1000))
      if (s < 60) return `${s}s`
      const m = Math.floor(s / 60)
      return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          {activos} trabajando · {v.filas.length} en los últimos 2 días
        </Text>
        {v.filas.length === 0 && <Text dimColor>Buscando chats…</Text>}
        {v.filas.map(f => {
          const vivo = f.estado !== 'libre'
          const icono = f.estado === 'herramienta' ? '⚙' : vivo ? '●' : '○'
          const color = f.estado === 'herramienta' ? 'yellow' : vivo ? 'green' : undefined
          const detalle =
            f.estado === 'herramienta'
              ? `usando ${f.herramienta} · ${reloj(v.ahora - f.desde)}`
              : vivo
                ? 'trabajando…'
                : `libre · hace ${reloj(v.ahora - f.desde)}`
          return (
            <Box flexDirection="column">
              <Box gap={1}>
                <Text color={color}>{icono}</Text>
                <Text bold={vivo} dimColor={!vivo} wrap="truncate-end">
                  {f.titulo}
                  {f.esEste ? ' (este)' : ''}
                </Text>
              </Box>
              <Box gap={1}>
                <Text dimColor wrap="truncate-end">
                  {'  '}
                  {f.carpeta} · {detalle}
                </Text>
                {!f.esEste && (
                  <Button key={`abrir-${f.id}`} label="Abrir" plain onPress={() => void abrir($, f.link, f.titulo)} />
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
