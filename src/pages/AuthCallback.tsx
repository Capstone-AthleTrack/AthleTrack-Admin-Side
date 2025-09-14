import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/data';

export default function AuthCallback() {
  const nav = useNavigate();
  useEffect(() => {
    const t = setTimeout(async () => {
      const s = await api.auth.getSession();
      nav(s ? '/dashboard' : '/sign-in', { replace: true });
    }, 400);
    return () => clearTimeout(t);
  }, [nav]);
  return <div className="p-6">Confirming your account…</div>;
}
