import { createClient, FunctionsHttpError, type RealtimeChannel, type Session } from '@supabase/supabase-js'
import { DEFAULT_GAME_RULES, type GameRules } from './game-rules'
import type { LocalGameState } from './local-game'
import type { BoardPosition } from './online-game'

export type OnlineGame = {
  id: string
  status: 'waiting' | 'active'
  visibility: 'public' | 'private'
  rules: GameRules
  initial_board: BoardPosition
  board: BoardPosition
  seat: number | null
  current_player: number
  revision: number
  players: { seat: number; name: string }[]
  moves: { player: number; notation: string; board_after: BoardPosition }[]
}

type LobbyGame = {
  id: string
  created_at: string
  players: string[]
  seats: (string | null)[]
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
const lobbyDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

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
  const invitedGame = byId<HTMLButtonElement>('online-invited')
  const currentGame = byId('online-current')
  const publicLobby = byId('public-lobby')
  const publicFooter = byId('public-lobby-footer')
  const publicGames = byId('public-game-list')
  const publicStatus = byId('public-lobby-status')
  const publicStatusRow = byId('public-lobby-status-row')
  const refreshLobby = byId<HTMLButtonElement>('public-lobby-refresh')
  const moreGames = byId<HTMLButtonElement>('public-lobby-more')
  const roomPanel = byId('online-room')
  const status = byId('online-status')
  const turn = byId('online-turn')
  const stopWatching = byId('online-stop-watching')
  const observerCount = byId('observer-count')
  const observerLabel = byId('observer-label')
  const name = profile.elements.namedItem('displayName') as HTMLInputElement
  const client = createClient(url, publicKey)
  let session: Session | null = null
  let game: OnlineGame | null = null
  let channel: RealtimeChannel | null = null
  let poll: number | undefined
  let switchingRoom = false
  let refreshing = false
  let channelReady = false
  let lobbyOffset = 0
  let hasProfile = false
  const startupParams = new URL(location.href).searchParams
  const requestedGame = startupParams.get('game')
  const initialInvite = requestedGame && invitePattern.test(requestedGame) ? requestedGame : null
  const initialWatch = startupParams.get('watch')
  const requestedMode = startupParams.get('online')
  const initialMode = requestedMode === 'create' ? 'create' :
    initialInvite || requestedMode === 'join' || requestedMode === 'lobby' ? 'lobby' : null
  let mode: 'lobby' | 'create' | 'room' = initialMode ?? 'lobby'
  let pendingJoinRoom = initialInvite
  const initialSeat = Number(startupParams.get('seat'))
  let pendingJoinSeat = Number.isInteger(initialSeat) && initialSeat >= 1 && initialSeat <= 3 ? initialSeat : null
  let joinRequested = !!initialInvite && requestedMode === 'join'

  function inviteLink(id: string) {
    const link = new URL(location.pathname, location.origin)
    link.searchParams.set('game', id)
    return link.href
  }

  function watchLink(id: string) {
    const link = new URL(location.pathname, location.origin)
    link.searchParams.set('watch', id)
    return link.href
  }

  async function sendSignInLink(email: string, room?: string | null, nextMode?: string, seat?: number | null) {
    const redirect = url === hostedSupabaseUrl ? new URL(hostedGameUrl) : new URL(location.pathname, location.origin)
    if (room && invitePattern.test(room)) redirect.searchParams.set('game', room)
    if (nextMode) redirect.searchParams.set('online', nextMode)
    if (room && seat) redirect.searchParams.set('seat', String(seat))
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
    status.hidden = !message
  }

  function render() {
    const showPublicLobby = mode === 'lobby' || mode === 'create' && !session
    title.textContent = showPublicLobby ? 'Online Lobby' : mode === 'create' ? 'Create Online Game' : 'Online play'
    login.hidden = !!session
    account.hidden = !session
    lobby.hidden = mode === 'room'
    createForm.hidden = mode !== 'create'
    invitedGame.hidden = mode !== 'lobby' || !pendingJoinRoom || game?.id === pendingJoinRoom
    publicLobby.hidden = publicFooter.hidden = !showPublicLobby
    roomPanel.hidden = !game || mode !== 'room'
    currentGame.hidden = !game
    byId('online-seats').replaceChildren(...Array.from({ length: 3 }, (_, index) => {
      const row = document.createElement('li')
      const player = game?.players.find(player => player.seat === index + 1)
      row.textContent = (player?.name ?? 'Open seat') + (game?.seat === index + 1 ? ' (you)' : '')
      return row
    }))
    stopWatching.hidden = game?.seat !== null
    turn.textContent = !game ? '' : (game.seat === null ? 'Watching · ' : '') + (game.status === 'waiting' ? `Waiting for players (${game.players.length}/3)` :
      game.current_player === game.seat ? 'Your turn' :
      `${game.players.find(player => player.seat === game?.current_player)?.name ?? 'Player ' + game.current_player}’s turn`)
  }

  function setGame(next: OnlineGame | null) {
    game = next
    render()
    onGame(next)
  }

  async function request<T = OnlineGame>(input: Record<string, unknown>) {
    if (!session && input.action !== 'list' && input.action !== 'observe') throw new Error('Sign in to play online.')
    const { data, error } = await client.functions.invoke<T>('starwell', { body: input })
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.error ?? 'Online play is temporarily unavailable.')
    }
    if (error || !data) throw new Error('Could not reach the game server.')
    return data
  }

  function lobbyStatus(message: string) {
    publicStatus.textContent = message
    publicStatusRow.hidden = !message
  }

  async function loadPublicGames(append = false) {
    if (refreshLobby.disabled) return
    refreshLobby.disabled = moreGames.disabled = true
    lobbyStatus('Loading games…')
    try {
      const { games, hasMore } = await request<{ games: LobbyGame[]; hasMore: boolean }>({
        action: 'list', offset: append ? lobbyOffset : 0,
      })
      if (!append) {
        publicGames.replaceChildren()
        lobbyOffset = 0
      }
      const displayed = new Set(Array.from(publicGames.children, row => (row as HTMLElement).dataset.gameId))
      for (const listed of games) {
        if (displayed.has(listed.id)) continue
        const row = document.createElement('tr')
        row.dataset.gameId = listed.id
        const created = row.insertCell()
        const timestamp = Date.parse(listed.created_at)
        if (Number.isFinite(timestamp)) {
          const time = document.createElement('time')
          time.dateTime = listed.created_at
          time.textContent = lobbyDate.format(timestamp)
          created.append(time)
        } else {
          created.textContent = '—'
        }
        for (let seat = 0; seat < 3; seat++) {
          const cell = row.insertCell()
          const name = listed.seats ? listed.seats[seat] : listed.players[seat]
          if (name) {
            cell.textContent = name
            continue
          }
          const join = document.createElement('button')
          join.type = 'button'
          join.className = 'export-action'
          join.textContent = 'JOIN'
          join.setAttribute('aria-label', `Join as Player ${seat + 1} in game with ${listed.players.join(', ')}`)
          join.addEventListener('click', () => run(() => joinGame(listed.id, seat + 1)))
          cell.append(join)
        }
        const watch = document.createElement('button')
        watch.type = 'button'
        watch.className = 'export-action'
        watch.textContent = 'Watch'
        watch.setAttribute('aria-label', `Watch game with ${listed.players.join(', ')}`)
        watch.addEventListener('click', () => run(() => observeGame(listed.id)))
        row.insertCell().append(watch)
        publicGames.append(row)
      }
      lobbyOffset += games.length
      moreGames.hidden = !hasMore
      lobbyStatus(publicGames.children.length ? '' : 'No public games yet.')
    } catch (error) {
      lobbyStatus(error instanceof Error ? error.message : 'Could not load public games.')
    } finally {
      refreshLobby.disabled = moreGames.disabled = false
    }
  }

  async function refresh() {
    if (!game || refreshing) return
    const id = game.id
    const watching = game.seat === null
    const user = session?.user.id
    refreshing = true
    try {
      const next = await request({ action: watching ? 'observe' : 'read', room: id })
      if (game?.id === id && (game.seat === null) === watching &&
          (watching || session?.user.id === user) && next.revision >= game.revision) setGame(next)
    } catch {
      // Retry after the next update or poll.
    } finally {
      refreshing = false
    }
  }

  function disconnect() {
    if (channel) void client.removeChannel(channel)
    channel = null
    channelReady = false
    renderObservers(0)
    window.clearInterval(poll)
    poll = undefined
  }

  function renderObservers(count: number) {
    observerCount.hidden = count === 0
    observerLabel.textContent = count === 1 ? '1 observer' : `${count} observers`
  }

  function openGame(next: OnlineGame) {
    const reconnect = game?.id !== next.id || !channel
    mode = 'room'
    history.replaceState(null, '', next.seat === null ? watchLink(next.id) : inviteLink(next.id))
    setGame(next)
    if (!reconnect) {
      if (channelReady && next.visibility === 'public') {
        if (next.seat === null) void channel?.track({ watching: true })
        else void channel?.untrack()
      }
      return
    }
    disconnect()
    const roomChannel = client.channel(`game:${next.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${next.id}` }, () => void refresh())
    if (next.visibility === 'public') {
      roomChannel.on('presence', { event: 'sync' }, () => {
        if (channel !== roomChannel) return
        const observers = Object.values(roomChannel.presenceState<{ watching?: boolean }>()).flat()
        renderObservers(observers.filter(observer => observer.watching === true).length)
      })
    }
    channel = roomChannel
    roomChannel.subscribe(state => {
      if (channel !== roomChannel || state !== 'SUBSCRIBED') return
      channelReady = true
      if (game?.seat === null && next.visibility === 'public') void roomChannel.track({ watching: true })
      void refresh()
    })
    poll = window.setInterval(() => void refresh(), 6000)
  }

  function leaveGame() {
    disconnect()
    if (game) {
      history.replaceState(null, '', location.pathname)
      pendingJoinRoom = null
      pendingJoinSeat = null
      joinRequested = false
      mode = 'lobby'
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

  async function observeGame(room: string) {
    if (switchingRoom) return
    switchingRoom = true
    try {
      openGame(await request({ action: 'observe', room }))
      dialog.close()
    } finally {
      switchingRoom = false
    }
  }

  async function joinGame(room: string, seat: number | null) {
    mode = 'lobby'
    pendingJoinRoom = room
    pendingJoinSeat = seat
    joinRequested = true
    render()
    if (!session) {
      notice('Sign in to join this game.')
      login.querySelector('input')?.focus()
      return
    }
    if (!hasProfile) {
      notice('Save a display name to join this game.')
      name.focus()
      return
    }
    if (await enter({ action: 'join', room, seat })) {
      pendingJoinRoom = null
      pendingJoinSeat = null
      joinRequested = false
    }
  }

  byId('public-lobby-create').addEventListener('click', () => {
    mode = 'create'
    pendingJoinRoom = null
    pendingJoinSeat = null
    joinRequested = false
    notice(session ? '' : 'Sign in to create an online game.')
    render()
    if (!session) login.querySelector('input')?.focus()
  })
  invitedGame.addEventListener('click', () => run(async () => {
    if (pendingJoinRoom) await joinGame(pendingJoinRoom, pendingJoinSeat)
  }))
  currentGame.addEventListener('click', () => {
    mode = 'room'
    render()
    byId('online-copy').focus()
  })
  submit('online-login', async fields => {
    const nextMode = mode === 'create' ? 'create' : joinRequested ? 'join' : 'lobby'
    await sendSignInLink(String(fields.get('email')).trim(), mode === 'lobby' ? pendingJoinRoom : null, nextMode, pendingJoinSeat)
    notice('Email sent. Check your email for the sign-in link from Supabase.')
  })

  submit('online-profile', async fields => {
    if (!session) return
    const displayName = String(fields.get('displayName')).trim()
    if (!displayName) throw new Error('Enter a display name.')
    const { error } = await client.from('profiles').upsert({ id: session.user.id, display_name: displayName })
    if (error) throw error
    hasProfile = true
    notice('Display name saved.')
    if (mode === 'lobby' && joinRequested && pendingJoinRoom) await joinGame(pendingJoinRoom, pendingJoinSeat)
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
    const link = game.seat === null ? watchLink(game.id) : inviteLink(game.id)
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
  stopWatching.addEventListener('click', leaveGame)
  refreshLobby.addEventListener('click', () => void loadPublicGames())
  moreGames.addEventListener('click', () => void loadPublicGames(true))
  client.auth.onAuthStateChange((_event, nextSession) => {
    const priorUser = session?.user.id
    session = nextSession
    const user = session?.user.id
    if (priorUser && priorUser !== user && game?.seat !== null) leaveGame()
    if (priorUser === user) return
    name.value = ''
    hasProfile = false
    notice('')
    render()
    if (!user) return
    window.setTimeout(() => {
      void client.from('profiles').select('display_name').eq('id', user).maybeSingle().then(({ data, error }) => {
        if (session?.user.id !== user) return
        if (error) notice('Could not load your display name.')
        else {
          hasProfile ||= !!data
          if (!name.value) name.value = data?.display_name ?? ''
        }
        const target = pendingJoinRoom
        if (joinRequested && target && mode === 'lobby' && dialog.open && !game) {
          run(() => joinGame(target, pendingJoinSeat))
        }
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
  if (initialMode) {
    dialog.showModal()
    if (!publicLobby.hidden) void loadPublicGames()
  } else if (initialWatch && invitePattern.test(initialWatch)) {
    void observeGame(initialWatch).catch(error => {
      mode = 'lobby'
      render()
      dialog.showModal()
      void loadPublicGames()
      notice(error instanceof Error ? error.message : 'Could not open this game.')
    })
  }

  return {
    currentUserId: () => session?.user.id ?? null,
    async saveLocalGame(id: string, state: LocalGameState) {
      const { error } = await client.rpc('starwell_save_local_game', {
        game_id: id, game_state: state, turns: state.moves.length,
      })
      if (error) throw error
    },
    async listLocalGames() {
      const { data, error } = await client.from('local_games')
        .select('id, updated_at, turn_number').order('updated_at', { ascending: false })
      if (error) throw error
      return data
    },
    async loadLocalGame(id: string): Promise<LocalGameState> {
      const { data, error } = await client.from('local_games').select('state').eq('id', id).single()
      if (error) throw error
      return data.state
    },
    leaveGame,
    openLobby() {
      mode = 'lobby'
      notice('')
      render()
      dialog.showModal()
      void loadPublicGames()
    },
    async move(current: OnlineGame, path: string[]) {
      try {
        const next = await request({ action: 'move', room: current.id, path, revision: current.revision })
        if (game?.id === current.id && game.seat !== null && next.revision >= game.revision) setGame(next)
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
