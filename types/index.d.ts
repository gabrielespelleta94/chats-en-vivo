export type Estado = 'pensando' | 'herramienta' | 'libre' | 'cerrada'

// Latido que deja cada chat que tiene el mod cargado (detalle de herramienta)
export type Chat = {
  id: string
  carpeta: string
  prompt: string
  estado: Estado
  herramienta: string
  herramientas: number
  inicioTurno: number
  actualizado: number
}

// Una fila del panel: un chat de la app de escritorio
export type Fila = {
  id: string
  titulo: string
  carpeta: string
  link: string
  estado: Estado
  herramienta: string
  desde: number
  esEste: boolean
}

export type Vista = { filas: Fila[]; ahora: number }

declare module 'claude-code' {
  interface PluginState {
    'chats-en-vivo': { vista: Vista }
  }
}
