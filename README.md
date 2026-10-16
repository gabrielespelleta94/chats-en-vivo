# chats-en-vivo

Un mod para Claude Code que añade un panel a la derecha con los chats de la app de escritorio que están pensando ahora mismo.

## Qué hace

- Lista los chats con actividad reciente (últimos 2 días) y marca cuáles están trabajando.
- Muestra qué herramienta está usando cada uno en ese momento.
- Cada fila tiene un botón para abrir ese chat en la app.
- Se abre con el comando `/chats`.

## Cómo funciona por dentro

- Lee las fichas de sesión que la app guarda en `AppData\Roaming\Claude\claude-code-sessions` (título, id, archivado).
- Mira las transcripciones en `~/.claude/projects`: si se han escrito hace menos de 20 segundos, el chat está trabajando.
- Cada chat con el mod cargado guarda un latido en `~/.claude/chats-en-vivo/<id>.json` con la herramienta en curso y el prompt recortado a 80 caracteres.

**Aviso de privacidad:** ese latido incluye el principio de tu prompt (80 caracteres). Se queda en tu disco, en local, y el mod no envía nada a ningún sitio. Si no quieres que se guarde, borra la carpeta `~/.claude/chats-en-vivo` o quita esa parte de `hooks/register.tsx`.

## Requisitos

- Windows y la app de escritorio de Claude.
- Para abrir los chats usa `rundll32` con enlaces `claude://`.
- Depende de ficheros internos de la app (la carpeta `claude-code-sessions` y el formato de las fichas) que pueden cambiar en cualquier versión y romper el mod sin aviso.

## Instalación

En Claude Code:

```
/plugin install chats-en-vivo --marketplace gabrielespelleta94/chats-en-vivo
```

Después escribe `/chats` para abrir el panel.

## Estructura

```
.claude-plugin/plugin.json        manifiesto
.claude-plugin/marketplace.json   para instalarlo con /plugin install
hooks/hooks.json             módulos que se cargan
hooks/register.tsx           panel, comando /chats, latidos y lectura de sesiones
tests/pane.test.ts           tests del panel
types/index.d.ts             tipos
```

## Licencia

MIT
