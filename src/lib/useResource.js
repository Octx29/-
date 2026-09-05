import { useEffect, useState } from 'react';
import { api } from './api';

export function useResource(path) {
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ path: null, data: null, error: '' });
  useEffect(() => {
    let active = true;
    setResult({ path, data: null, error: '' });
    api.get(path).then(data => {
      if (active) setResult({ path, data, error: '' });
    }).catch(error => {
      if (active) setResult({ path, data: null, error: error.message });
    });
    return () => { active = false; };
  }, [path, reload]);
  return {
    data: result.path === path ? result.data : null,
    error: result.path === path ? result.error : '',
    retry: () => setReload(value => value + 1),
  };
}
