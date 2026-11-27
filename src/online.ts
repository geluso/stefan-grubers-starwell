import { createClient, FunctionsHttpError, type RealtimeChannel, type Session } from '@supabase/supabase-js'
import { DEFAULT_GAME_RULES, type GameRules } from './game-rules'
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

const hostedSupabaseUrl = "https://thdteixjchanisqqqhab.supabase.co"
const hostedGameUrl = 'https://5tephen.com/starwell/'
const hostedPublishableKey = "sb_publishable_eY5G7gdHIvSXfPSs5wcZSw__eYhI0eB"

let url = hostedSupabaseUrl
let publicKey = hostedPublishableKey
try {
  const overrideUrl = process.env.STARWELL_PUBLIC_SUPABASE_URL
  const overrideKey = process.env.STARWELL_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (overrideUrl && overrideKey) {
    url = overrideUrl
    publicKey = overrideKey
  }
} catch {
  // Use the hosted project when Bun's HTML server leaves build variables unset.
}
const invitePattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
type LobbyMode = 'create' | 'join'

export function bindOnlinePlay(onGame: (game: OnlineGame | null) => void) {
  const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
  const dialog = byId<HTMLDialogElement>('online-dialog')
  const inviteDialog = byId<HTMLDialogElement>('game-invite-dialog')
  const gameLink = byId<HTMLInputElement>('game-invite-link')
  const copyStatus = byId('game-invite-copy-status')
  const emailStatus = byId('game-invite-email-status')
  const title = byId('online-title')
  const login = byId<HTMLFormElement>('online-login')
  const profile = byId<HTMLFormElement>('online-profile')
  const account = byId('online-account')
  const lobby = byId('online-lobby')
  const createForm = byId<HTMLFormElement>('online-create')
  const joinForm = byId<HTMLFormElement>('online-join')
  const currentGame = byId('online-current')
  const roomPanel = byId('online-room')
  const status = byId('online-status')
  const turn = byId('online-turn')
  const invite = joinForm.elements.namedItem('invite') as HTMLInputElement
  const name = profile.elements.namedItem('displayName') as HTMLInputElement
  const client = createClient(url, publicKey)
  let session: Session | null = null
  let game: OnlineGame | null = null
  let channel: RealtimeChannel | null = null
  let poll: number | undefined
  let switchingRoom = false
  let refreshing = false
  const startupParams = new URL(location.href).searchParams
  const requestedGame = startupParams.get('game')
  const initialInvite = requestedGame && invitePattern.test(requestedGame) ? requestedGame : null
  const requestedMode = startupParams.get('online')
  const initialMode = initialInvite ? 'join' : requestedMode === 'join' || requestedMode === 'create' ? requestedMode : null
  let mode: LobbyMode | 'room' = initialMode ?? 'create'

  function inviteLink(id: string) {
    const link = new URL(location.pathname, location.origin)
    link.searchParams.set('game', id)
    return link.href
  }

  async function sendSignInLink(email: string, room?: string | null, nextMode?: LobbyMode) {
    const redirect = url === hostedSupabaseUrl ? new URL(hostedGameUrl) : new URL(location.pathname, location.origin)
    if (room && invitePattern.test(room)) redirect.searchParams.set('game', room)
    else if (nextMode) redirect.searchParams.set('online', nextMode)
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect.href } })
    if (error) throw error
  }

  async function emailInvites(emails: string[], room: string) {
    const results = await Promise.allSettled(emails.map(email => sendSignInLink(email, room)))
    if (gameLink.value !== inviteLink(room)) return
    const sent = results.filter(result => result.status === 'fulfilled').length
    if (sent === emails.length) {
      emailStatus.textContent = sent === 1 ? 'Invitation email sent.' : 'Both invitation emails sent.'
    } else {
      emailStatus.textContent = sent
        ? 'One invitation email was sent. Share the game link with the other player.'
        : 'Supabase couldn’t send the email invitations. You can share the game link directly.'
    }
  }

  function notice(message: string) {
    status.textContent = message
  }

  function render() {
    title.textContent = !session ? 'Sign in to play online' : mode === 'create' ? 'Create Online Game' :
      mode === 'join' ? 'Join Online Game' : 'Online play'
    login.hidden = !!session
    account.hidden = !session
    lobby.hidden = mode === 'room'
    createForm.hidden = mode !== 'create'
    joinForm.hidden = mode !== 'join'
    roomPanel.hidden = !game || mode !== 'room'
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
    if (!session) throw new Error('Sign in to play online.')
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
    if (channel) void client.removeChannel(channel)
    channel = null
    window.clearInterval(poll)
    poll = undefined
  }

  function openGame(next: OnlineGame) {
    disconnect()
    mode = 'room'
    history.replaceState(null, '', inviteLink(next.id))
    invite.value = inviteLink(next.id)
    setGame(next)
    channel = client.channel(`game:${next.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${next.id}` }, () => void refresh())
      .subscribe(state => { if (state === 'SUBSCRIBED') void refresh() })
    poll = window.setInterval(() => void refresh(), 6000)
  }

  function leaveGame() {
    disconnect()
    if (game) {
      history.replaceState(null, '', location.pathname)
      invite.value = ''
      mode = 'create'
      setGame(null)
    }
  }

  function run(action: () => Promise<void>) {
    notice('')
    void action().catch(error => notice(error instanceof Error ? error.message : String(error)))
  }

  function submit(id: string, action: (fields: FormData) => Promise<void>) {
    const form = byId<HTMLFormElement>(id)
    const button = form.querySelector<HTMLButtonElement>('button')!
    form.addEventListener('submit', event => {
      event.preventDefault()
      if (button.disabled) return
      button.disabled = true
      form.setAttribute('aria-busy', 'true')
      run(async () => {
        try {
          await action(new FormData(form))
        } finally {
          form.removeAttribute('aria-busy')
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
      return next
    } finally {
      switchingRoom = false
    }
  }

  if (initialInvite) invite.value = inviteLink(initialInvite)
  currentGame.addEventListener('click', () => {
    mode = 'room'
    render()
    byId('online-copy').focus()
  })
  submit('online-login', async fields => {
    const nextMode = mode === 'join' ? 'join' : 'create'
    await sendSignInLink(String(fields.get('email')).trim(), nextMode === 'join' ? initialInvite : null, nextMode)
    notice('Email sent. Check your email for the sign-in link from Supabase.')
  })

  submit('online-profile', async fields => {
    if (!session) return
    const displayName = String(fields.get('displayName')).trim()
    if (!displayName) throw new Error('Enter a display name.')
    const { error } = await client.from('profiles').upsert({ id: session.user.id, display_name: displayName })
    if (error) throw error
    notice('Display name saved.')
    await refresh()
  })

  submit('online-create', async fields => {
    const emails = [...new Set(fields.getAll('inviteEmail').map(value => String(value).trim().toLowerCase()).filter(Boolean))]
    const created = await enter({ action: 'create', knightJump: DEFAULT_GAME_RULES.knightJump })
    if (!created) return
    createForm.reset()
    gameLink.value = inviteLink(created.id)
    copyStatus.hidden = true
    emailStatus.hidden = emails.length === 0
    emailStatus.textContent = emails.length === 1 ? 'Sending invitation email…' :
      emails.length === 2 ? 'Sending invitation emails…' : ''
    dialog.close()
    inviteDialog.showModal()
    if (emails.length) void emailInvites(emails, created.id)
  })
  submit('online-join', async fields => {
    const value = String(fields.get('invite')).trim()
    const id = invitePattern.test(value) ? value : new URL(value, location.href).searchParams.get('game')
    if (!id || !invitePattern.test(id)) throw new Error('Enter a valid invite link.')
    await enter({ action: 'join', room: id })
  })

  byId('game-invite-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(gameLink.value)
      copyStatus.textContent = 'Game link copied.'
    } catch {
      gameLink.focus()
      gameLink.select()
      copyStatus.textContent = 'Game link selected for copying.'
    }
    copyStatus.hidden = false
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
  client.auth.onAuthStateChange((_event, nextSession) => {
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
  if (initialMode) dialog.showModal()

  return {
    openLobby(nextMode: LobbyMode) {
      mode = nextMode
      if (game && invite.value === inviteLink(game.id)) invite.value = ''
      notice('')
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
