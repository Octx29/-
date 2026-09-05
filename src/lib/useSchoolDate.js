import { useEffect, useState } from 'react';
import { schoolDate } from '../../shared/schoolDate.js';

export function useSchoolDate() {
  const [date, setDate] = useState(schoolDate);
  useEffect(() => {
    const refresh = () => setDate(schoolDate());
    const interval = setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, []);
  return date;
}
