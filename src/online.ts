import { createClient, FunctionsHttpError, type RealtimeChannel, type Session } from '@supabase/supabase-js'
import type { GameRules } from './game-rules'
import type { BoardPosition } from './online-game'

export type OnlineGame = {
  id: string
  status: 'waiting' | 'active'
  rules: GameRules
  initial_board: BoardPosition
  board: BoardPosition
  seat: number
  current_player: number
  revision: number
  players: { seat: number; name: string }[]
  moves: { player: number; notation: string; board_after: BoardPosition }[]
}

declare const process: { env: Record<string, string | undefined> }

let url: string | undefined
let publicKey: string | undefined
try {
  url = process.env.STARWELL_PUBLIC_SUPABASE_URL
  publicKey = process.env.STARWELL_PUBLIC_SUPABASE_PUBLISHABLE_KEY
} catch {
  // Bun's HTML development server does not inline deployment settings.
}
const invitePattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export function bindOnlinePlay(onGame: (game: OnlineGame | null) => void) {
  const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
  const dialog = byId<HTMLDialogElement>('online-dialog')
  const login = byId<HTMLFormElement>('online-login')
  const profile = byId<HTMLFormElement>('online-profile')
  const account = byId('online-account')
  const lobby = byId('online-lobby')
  const currentGame = byId('online-current')
  const roomPanel = byId('online-room')
  const status = byId('online-status')
  const turn = byId('online-turn')
  const invite = byId<HTMLFormElement>('online-join').elements.namedItem('invite') as HTMLInputElement
  const name = profile.elements.namedItem('displayName') as HTMLInputElement
  const client = url && publicKey ? createClient(url, publicKey) : null
  let session: Session | null = null
  let game: OnlineGame | null = null
  let channel: RealtimeChannel | null = null
  let poll: number | undefined
  let switchingRoom = false
  let refreshing = false
  let showLobby = false

  function inviteLink(id: string) {
    const link = new URL(location.pathname, location.origin)
    link.searchParams.set('game', id)
    return link.href
  }

  function notice(message: string) {
    status.textContent = message
  }

  function render() {
    login.hidden = !client || !!session
    account.hidden = !session
    lobby.hidden = !!game && !showLobby
    roomPanel.hidden = !game || showLobby
    currentGame.hidden = !game
    byId('online-seats').replaceChildren(...Array.from({ length: 3 }, (_, index) => {
      const row = document.createElement('li')
      const player = game?.players.find(player => player.seat === index + 1)
      row.textContent = (player?.name ?? 'Open seat') + (game?.seat === index + 1 ? ' (you)' : '')
      return row
    }))
    turn.textContent = !game ? '' : game.status === 'waiting' ? `Waiting for players (${game.players.length}/3)` :
      game.current_player === game.seat ? 'Your turn' :
      `${game.players.find(player => player.seat === game?.current_player)?.name ?? 'Opponent'}’s turn`
  }

  function setGame(next: OnlineGame | null) {
    game = next
    render()
    onGame(next)
  }

  async function request(input: Record<string, unknown>) {
    if (!client || !session) throw new Error('Sign in to play online.')
    const { data, error } = await client.functions.invoke<OnlineGame>('starwell', { body: input })
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.error ?? 'Online play is temporarily unavailable.')
    }
    if (error || !data) throw new Error('Could not reach the game server.')
    return data
  }

  async function refresh() {
    if (!game || refreshing) return
    const id = game.id
    const user = session?.user.id
    refreshing = true
    try {
      const next = await request({ action: 'read', room: id })
      if (game?.id === id && session?.user.id === user && next.revision >= game.revision) setGame(next)
    } catch {
      // Retry after the next update or poll.
    } finally {
      refreshing = false
    }
  }

  function disconnect() {
    if (channel) void client?.removeChannel(channel)
    channel = null
    window.clearInterval(poll)
    poll = undefined
  }

  function openGame(next: OnlineGame) {
    disconnect()
    showLobby = false
    history.replaceState(null, '', inviteLink(next.id))
    invite.value = inviteLink(next.id)
    setGame(next)
    channel = client?.channel(`game:${next.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${next.id}` }, () => void refresh())
      .subscribe(state => { if (state === 'SUBSCRIBED') void refresh() }) ?? null
    poll = window.setInterval(() => void refresh(), 6000)
  }

  function leaveGame() {
    disconnect()
    if (game) {
      history.replaceState(null, '', location.pathname)
      invite.value = ''
      setGame(null)
    }
  }

  function run(action: () => Promise<void>) {
    notice('')
    void action().catch(error => notice(error instanceof Error ? error.message : String(error)))
  }

  function submit(id: string, action: (fields: FormData) => Promise<void>) {
    const form = byId<HTMLFormElement>(id)
    form.addEventListener('submit', event => {
      event.preventDefault()
      const button = form.querySelector<HTMLButtonElement>('button')!
      button.disabled = true
      run(async () => {
        try {
          await action(new FormData(form))
        } finally {
          button.disabled = false
        }
      })
    })
  }

  async function enter(body: Record<string, unknown>) {
    if (switchingRoom) return
    switchingRoom = true
    const user = session?.user.id
    try {
      const next = await request(body)
      if (user !== session?.user.id) return
      openGame(next)
      if (next.status === 'active') dialog.close()
    } finally {
      switchingRoom = false
    }
  }

  const initialInvite = new URL(location.href).searchParams.get('game')
  if (initialInvite && invitePattern.test(initialInvite)) invite.value = inviteLink(initialInvite)
  currentGame.addEventListener('click', () => {
    showLobby = false
    render()
    byId('online-copy').focus()
  })
  if (initialInvite) dialog.showModal()
  if (!client) notice('Online play is unavailable on this build.')

  submit('online-login', async fields => {
    const redirect = new URL(location.pathname, location.origin)
    if (initialInvite && invitePattern.test(initialInvite)) redirect.searchParams.set('game', initialInvite)
    const result = await client!.auth.signInWithOtp({
      email: String(fields.get('email')).trim(),
      options: { emailRedirectTo: redirect.href },
    })
    if (result.error) throw result.error
    notice('Check your email for the sign-in link.')
  })

  submit('online-profile', async fields => {
    if (!session) return
    const displayName = String(fields.get('displayName')).trim()
    if (!displayName) throw new Error('Enter a display name.')
    const { error } = await client!.from('profiles').upsert({ id: session.user.id, display_name: displayName })
    if (error) throw error
    notice('Display name saved.')
    await refresh()
  })

  submit('online-create', fields => enter({ action: 'create', knightJump: fields.get('knightJump') }))
  submit('online-join', fields => {
    const value = String(fields.get('invite')).trim()
    const id = invitePattern.test(value) ? value : new URL(value, location.href).searchParams.get('game')
    if (!id || !invitePattern.test(id)) throw new Error('Enter a valid invite link.')
    return enter({ action: 'join', room: id })
  })

  byId('online-copy').addEventListener('click', () => run(async () => {
    if (!game) return
    const link = inviteLink(game.id)
    try {
      await navigator.clipboard.writeText(link)
      notice('Invite link copied.')
    } catch {
      notice(link)
    }
  }))
  byId('online-offline').addEventListener('click', () => {
    leaveGame()
    dialog.close()
  })
  byId('online-logout').addEventListener('click', () => run(async () => {
    const { error } = await client!.auth.signOut()
    if (error) throw error
  }))

  client?.auth.onAuthStateChange((_event, nextSession) => {
    const priorUser = session?.user.id
    session = nextSession
    const user = session?.user.id
    if (priorUser && priorUser !== user) leaveGame()
    if (priorUser === user) return
    name.value = ''
    notice('')
    render()
    if (!user) return
    window.setTimeout(() => {
      void client.from('profiles').select('display_name').eq('id', user).maybeSingle().then(({ data, error }) => {
        if (session?.user.id !== user) return
        if (error) notice('Could not load your display name.')
        else if (!name.value) name.value = data?.display_name ?? ''
      })
      const id = new URL(location.href).searchParams.get('game')
      if (id && invitePattern.test(id)) {
        void request({ action: 'read', room: id }).then(next => {
          if (!game && !switchingRoom && session?.user.id === user) {
            openGame(next)
            if (next.status === 'active') dialog.close()
          }
        }).catch(() => { /* Invited users can join from the lobby. */ })
      }
    }, 0)
  })
  render()

  return {
    openLobby() {
      showLobby = true
      if (game && invite.value === inviteLink(game.id)) invite.value = ''
      render()
      dialog.showModal()
    },
    async move(current: OnlineGame, path: string[]) {
      try {
        const next = await request({ action: 'move', room: current.id, path, revision: current.revision })
        if (game?.id === current.id && next.revision >= game.revision) setGame(next)
      } catch (error) {
        if (game?.id === current.id) {
          await refresh()
          turn.textContent = error instanceof Error ? error.message : 'Could not submit the move.'
        }
        throw error
      }
    },
  }
}
