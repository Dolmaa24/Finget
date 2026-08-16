import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN } from '../api';

/**
 * One socket for the whole app.
 *
 * Previously `useGroupLiveSync` opened its own connection, which was fine
 * while it was the only listener. The trip burn strip is a second, and every
 * component that opens its own socket is another connection the server holds,
 * another `joinGroup` handshake, and another chance for two views to be
 * looking at different rooms.
 *
 * Ref-counted rather than kept open forever: the last consumer to leave closes
 * it, so signing out or navigating away does not leave a socket running.
 */

let socket: Socket | null = null;
let consumers = 0;
let joinedGroupId: string | null = null;

/** The live socket, or null when nothing has acquired one yet. */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Acquire the shared socket and join `groupId`'s room.
 *
 * @returns a release function — call it on unmount, always.
 */
export function acquireSocket(groupId: string, token: string): () => void {
  if (!socket) {
    socket = io(API_ORIGIN, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
  }

  consumers += 1;
  const active = socket;

  const join = () => {
    // Re-emitted on every reconnect: the server's room membership does not
    // survive a dropped connection, and a silently roomless socket is the
    // failure mode where the strip simply stops updating.
    active.emit('joinGroup', { groupId, token });
    joinedGroupId = groupId;
  };

  if (active.connected) join();
  active.on('connect', join);

  return () => {
    active.off('connect', join);
    consumers -= 1;

    if (consumers <= 0) {
      if (joinedGroupId) active.emit('leaveGroup', { groupId: joinedGroupId });
      active.removeAllListeners();
      active.disconnect();
      socket = null;
      joinedGroupId = null;
      consumers = 0;
    }
  };
}
