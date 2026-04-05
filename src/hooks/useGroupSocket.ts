import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

const URL = 'http://localhost:5000';

export function useGroupSocket(groupId: string | null, onTransaction: () => void) {
  const { token } = useAuth();
  const cbRef = useRef(onTransaction);
  cbRef.current = onTransaction;

  useEffect(() => {
    if (!groupId || !token) return;

    const socket = io(URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      socket.emit('joinGroup', { groupId, token });
    });

    socket.on('transaction:created', () => {
      cbRef.current();
    });

    return () => {
      socket.emit('leaveGroup', { groupId });
      socket.disconnect();
    };
  }, [groupId, token]);
}
