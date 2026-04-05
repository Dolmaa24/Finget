import { useState, useCallback, useEffect } from 'react';
import { fetchFingetApi } from '../api';

export interface Group {
  _id: string;
  name: string;
  members: string[];
}

export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchFingetApi('/groups');
      setGroups(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const createGroup = async (name: string) => {
    const data = await fetchFingetApi('/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    setGroups((prev) => [...prev, data]);
    return data;
  };

  const joinGroup = async (id: string) => {
    const data = await fetchFingetApi(`/groups/${id}/join`, {
      method: 'POST',
    });
    setGroups((prev) => {
      if (prev.find((g) => g._id === id)) return prev;
      return [...prev, data];
    });
  };

  return { groups, loading, createGroup, joinGroup, loadGroups };
}
