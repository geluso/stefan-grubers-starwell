import assert from 'node:assert/strict'
import { createClient, type RealtimeChannel } from '@supabase/supabase-js'

const url = 'http://127.0.0.1:54321'
const key = process.env.PUBLISHABLE_KEY ?? process.env.ANON_KEY
const secret = process.env.SECRET_KEY ?? process.env.SERVICE_ROLE_KEY
if (!key || !secret) throw new Error('Load the local Supabase CLI environment first.')

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, secret, options)
const users: string[] = []
let room: string | undefined
let privateRoom: string | undefined
let channel: RealtimeChannel | undefined
let listener: ReturnType<typeof createClient> | undefined
const database = (sql: string) => Bun.spawn(['docker', 'exec', 'supabase_db_starwell', 'psql', '-U', 'postgres',
  '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], { stdout: 'ignore', stderr: 'inherit' }).exited
const createPlayer = async (seat: number) => {
  const email = `starwell-${crypto.randomUUID()}@example.com`
  const password = crypto.randomUUID()
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw created.error
  users.push(created.data.user.id)
  const client = createClient(url, key, options)
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error) throw signedIn.error
  const profile = await client.from('profiles').upsert({ id: created.data.user.id, display_name: `Tester ${seat}` })
  if (profile.error) throw profile.error
  return client
}

try {
  const player1 = await createPlayer(1)
  const guest = createClient(url, key, options)
  const [player2, player3, outsider] = await Promise.all([createPlayer(2), createPlayer(3), createPlayer(4)])
  const call = async (client: typeof player1, action: string, input: object = {}, status = 200) => {
    const { data, error } = await client.functions.invoke('starwell', { body: { action, room, ...input } })
    if (status === 200 && error) throw new Error(JSON.stringify(await error.context?.json() ?? error.message))
    assert.equal(error?.context?.status ?? 200, status, action)
    return data
  }

  const created = await call(player1, 'create', { knightJump: 'long' })
  room = created.id
  assert.equal(created.status, 'waiting')
  assert.equal(created.seat, 1)
  assert.equal(created.visibility, 'public')
  const listing = await call(guest, 'list')
  const listed = listing.games.find((game: { id: string }) => game.id === room)
  assert.ok(listed)
  assert.ok(Number.isFinite(Date.parse(listed.created_at)))
  assert.deepEqual(listed.seats, ['Tester 1', null, null])
  const watched = await call(guest, 'observe')
  assert.equal(watched.seat, null)
  assert.deepEqual(watched.players, [{ seat: 1, name: 'Tester 1' }])
  assert.equal((await call(player1, 'observe')).seat, null)
  await call(outsider, 'read', {}, 404)
  const unauthorized = await player1.rpc('starwell_join', { room, actor: users[0] })
  assert.ok(unauthorized.error)
  assert.deepEqual((await guest.from('games').select('id').eq('id', room)).data, [{ id: room }])
  await call(guest, 'move', { path: ['E2', 'H3'], revision: 0 }, 401)
  await call(player1, 'move', { path: ['E2', 'H3'], revision: 0 }, 409)
  const thirdSeat = await call(player3, 'join', { seat: 3 })
  assert.equal(thirdSeat.seat, 3)
  assert.equal(thirdSeat.status, 'waiting')
  assert.deepEqual((await call(guest, 'list')).games.find((game: { id: string }) => game.id === room).seats,
    ['Tester 1', null, 'Tester 3'])
  await call(outsider, 'join', { seat: 3 }, 409)
  const secondSeat = await call(player2, 'join')
  assert.equal(secondSeat.seat, 2)
  assert.equal(secondSeat.status, 'active')
  assert.equal((await call(player2, 'join')).seat, 2)
  await call(outsider, 'join', {}, 409)
  await call(outsider, 'move', { path: ['E2', 'H3'], revision: 2 }, 404)
  await call(player2, 'move', { path: ['E7', 'F7'], revision: 2 }, 409)
  await call(player1, 'move', { path: ['E2', 'F6'], revision: 2 }, 422)

  listener = guest
  const notification = Promise.withResolvers<number>()
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime subscription timed out.')), 8000)
    channel = guest.channel(`test:${room}`, { config: { postgres_changes_options: { wait: true } } })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${room}` }, message => {
        if (message.new.revision === 3) notification.resolve(message.new.revision)
      })
      .subscribe(state => {
        if (state === 'SUBSCRIBED') {
          clearTimeout(timeout)
          resolve()
        }
      })
  })
  const attempts = await Promise.all([
    player1.functions.invoke('starwell', { body: { action: 'move', room, path: ['E2', 'H3'], revision: 2 } }),
    player1.functions.invoke('starwell', { body: { action: 'move', room, path: ['E2', 'H3'], revision: 2 } }),
  ])
  assert.deepEqual(attempts.map(({ error }) => error?.context?.status ?? 200).sort(), [200, 409])
  const timeout = setTimeout(() => notification.reject(new Error('Realtime move update timed out.')), 8000)
  try {
    assert.equal(await notification.promise, 3)
  } finally {
    clearTimeout(timeout)
  }
  await call(player2, 'move', { path: ['E7', 'F7'], revision: 3 })
  const capture = await call(player3, 'move', { path: ['K10', 'E10'], revision: 4 })
  assert.equal(capture.moves[2].notation, 'K10xE10 P2+')
  const power = await call(player1, 'move', { path: ['H3', 'F4', 'C3'], revision: 5 })
  assert.deepEqual(power.moves.map((move: { notation: string }) => move.notation), [
    'E2-H3', 'E7-F7', 'K10xE10 P2+', 'H3-F4-C3',
  ])
  assert.equal(power.board.C3, 'n1')
  assert.equal(power.current_player, 2)
  assert.deepEqual((await call(player3, 'read')).board, power.board)
  assert.deepEqual((await call(player2, 'read')).moves, power.moves)
  assert.deepEqual((await call(guest, 'observe')).moves, power.moves)

  privateRoom = (await call(player1, 'create', { knightJump: 'long' })).id
  assert.equal(await database(`update public.games set visibility = 'private' where id = '${privateRoom}';`), 0)
  assert.ok(!(await call(guest, 'list')).games.some((game: { id: string }) => game.id === privateRoom))
  assert.deepEqual((await guest.from('games').select('id').eq('id', privateRoom)).data, [])
  await call(guest, 'observe', { room: privateRoom }, 404)
  assert.equal((await call(player1, 'read', { room: privateRoom })).seat, 1)
  console.log('Public lobby, spectator access, private visibility, turns, concurrent moves, Realtime, and history passed.')
} finally {
  if (channel) await listener?.removeChannel(channel)
  listener?.realtime.disconnect()
  for (const id of [room, privateRoom]) {
    if (id) await database(`delete from public.games where id = '${id}';`)
  }
  for (const id of users) await admin.auth.admin.deleteUser(id)
}
