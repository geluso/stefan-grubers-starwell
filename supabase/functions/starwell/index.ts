import { createClient } from 'npm:@supabase/supabase-js@2.119.2'
import { initialOnlineBoard, playOnlineTurn } from '../_shared/online-game.js'

const url = Deno.env.get('SUPABASE_URL')!
const secret = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
const origins = new Set(['https://5tephen.com', 'http://localhost:3000', 'http://127.0.0.1:3000'])
const roomId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args)
  if (error) throw error
  return data
}

Deno.serve(async request => {
  const origin = request.headers.get('origin')
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    ...(origin && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  }
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers })
  const fail = (error: string, status: number) => reply({ error }, status)
  if (origin && !origins.has(origin)) return fail('Origin is unavailable.', 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return fail('Use POST.', 405)

  try {
    const input = await request.json().catch(() => null)
    if (!input || typeof input !== 'object') return fail('Invalid request.', 400)
    if (input.action === 'list') {
      const offset = input.offset ?? 0
      if (!Number.isInteger(offset) || offset < 0 || offset > 2147483647) return fail('Invalid page.', 400)
      const games = await rpc('starwell_list_games', { page_start: offset })
      return reply({ games: games.slice(0, 50), hasMore: games.length > 50 })
    }
    if (input.action === 'observe') {
      const room = input.room
      if (typeof room !== 'string' || !roomId.test(room)) return fail('Enter a valid game link.', 400)
      const game = await rpc('starwell_read', { room, actor: null })
      return game ? reply(game) : fail('This game is unavailable to observers.', 404)
    }
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!token) return fail('Sign in to play online.', 401)
    const { data: { user }, error } = await db.auth.getUser(token)
    if (error || !user) return fail('Sign in to play online.', 401)
    const actor = user.id

    if (input.action === 'create' || input.action === 'join') {
      const { data: profile, error } = await db.from('profiles').select('id').eq('id', actor).maybeSingle()
      if (error) throw error
      if (!profile) return fail('Save your display name first.', 400)
    }

    if (input.action === 'create') {
      const knightJump = input.knightJump
      if (knightJump !== 'short' && knightJump !== 'long') return fail('Choose a knight rule.', 400)
      const room = await rpc('starwell_create', { actor, game_rules: { knightJump }, starting_board: initialOnlineBoard() })
      return reply(await rpc('starwell_read', { room, actor }))
    }

    const room = input.room
    if (typeof room !== 'string' || !roomId.test(room)) return fail('Enter a valid invite link.', 400)
    if (input.action === 'join') {
      const seat = input.seat ?? null
      if (seat !== null && (!Number.isInteger(seat) || seat < 1 || seat > 3)) return fail('Choose a valid seat.', 400)
      if (!await rpc('starwell_join', { room, actor, preferred_seat: seat })) {
        return fail(seat ? 'That seat is unavailable. Refresh the lobby to choose another.' : 'Game is full or unavailable.', 409)
      }
    } else if (input.action !== 'read' && input.action !== 'move') {
      return fail('Unknown action.', 400)
    }

    const game = await rpc('starwell_read', { room, actor })
    if (!game) return fail('Join this game using its invite link.', 404)
    if (input.action !== 'move') return reply(game)
    const { path, revision } = input
    if (!Array.isArray(path) || path.length < 2 || path.length > 3 ||
        !path.every(name => typeof name === 'string' && /^[A-K](?:[1-9]|1[01])$/.test(name)) ||
        !Number.isInteger(revision)) return fail('Invalid move.', 400)
    if (game.revision !== revision) return fail('The game changed. Try again on the latest board.', 409)
    if (game.status !== 'active' || game.current_player !== game.seat) return fail('Wait for your turn.', 409)

    const move = playOnlineTurn(game.board, game.seat, path, game.rules)
    if (!move) return fail('That move is illegal.', 422)
    const applied = await rpc('starwell_move', {
      room, actor, expected_revision: revision, move_path: path, move_notation: move.notation, next_board: move.board,
    })
    if (!applied) return fail('The game changed. Try again on the latest board.', 409)
    return reply(await rpc('starwell_read', { room, actor }))
  } catch (error) {
    console.error(error)
    return fail('Online play is temporarily unavailable.', 500)
  }
})
