'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Send,
  Inbox,
  Activity,
  History,
  User,
  Users,
  Building2,
  Briefcase,
  RefreshCw,
  BarChart3,
  Settings,
  LogOut,
  FileText,
  ScrollText,
  X,
  Smile,
  Contact,
  Megaphone,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';

interface MenuItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const COLABORADOR_MENU: MenuItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/feedbacks/recebidos', label: 'Feedbacks Recebidos', icon: Inbox },
  { href: '/feedbacks/enviados', label: 'Feedbacks Enviados', icon: Send },
  { href: '/pulse', label: 'Feedback Pulse', icon: Activity },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/atribuicoes-especialistas', label: 'Atribuições Especialistas', icon: Contact },
  { href: '/perfil', label: 'Meu Perfil', icon: User },
];

const GESTOR_MENU: MenuItem[] = [
  ...COLABORADOR_MENU.slice(0, 4),
  { href: '/pulse/time', label: 'Avaliação do Time', icon: Users },
  { href: '/relatorios', label: 'Relatórios', icon: FileText },
  ...COLABORADOR_MENU.slice(4),
];

const ADMIN_MENU: MenuItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cadastros/pessoas', label: 'Pessoas', icon: Users },
  { href: '/cadastros/areas', label: 'Áreas', icon: Building2 },
  { href: '/cadastros/cargos', label: 'Cargos', icon: Briefcase },
  { href: '/ciclos-pulse', label: 'Ciclos Pulse', icon: RefreshCw },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/auditoria', label: 'Auditoria', icon: ScrollText },
  { href: '/nps', label: 'NPS', icon: Smile },
  { href: '/atribuicoes-especialistas', label: 'Atribuições Especialistas', icon: Contact },
  { href: '/comunicados', label: 'Comunicados', icon: Megaphone },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

// Gestor também cadastra pessoas (restrito à própria área — seção 5.3 do mapeamento técnico)
const GESTOR_MENU_COM_CADASTRO: MenuItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cadastros/pessoas', label: 'Pessoas', icon: Users },
  { href: '/feedbacks/recebidos', label: 'Feedbacks Recebidos', icon: Inbox },
  { href: '/feedbacks/enviados', label: 'Feedbacks Enviados', icon: Send },
  { href: '/pulse', label: 'Feedback Pulse', icon: Activity },
  { href: '/pulse/time', label: 'Avaliação do Time', icon: Users },
  { href: '/relatorios', label: 'Relatórios', icon: FileText },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/atribuicoes-especialistas', label: 'Atribuições Especialistas', icon: Contact },
  { href: '/comunicados', label: 'Comunicados', icon: Megaphone },
  { href: '/perfil', label: 'Meu Perfil', icon: User },
];

// mobileOpen/onMobileClose são opcionais de propósito — no desktop (md+)
// o Sidebar continua exatamente como sempre foi, sempre visível, sem
// depender de nenhum estado. Só no mobile (abaixo de md) que ele vira um
// painel deslizante, controlado por esses dois props.
export function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  if (!user) return null;

  const menu =
    user.role === 'ADMIN'
      ? ADMIN_MENU
      : user.role === 'GESTOR'
        ? GESTOR_MENU_COM_CADASTRO
        : COLABORADOR_MENU;

  return (
    <>
      {/* Camada escura atrás do menu, só no mobile e só quando aberto —
          clicar nela fecha o menu. Nunca aparece no desktop (md:hidden). */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 bg-p-primary-dark text-white flex flex-col transform transition-transform duration-200 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:sticky md:top-0`}
      >
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <span className="text-xl font-semibold">
            Pulse<span className="text-p-secondary">One</span>
          </span>
          {/* Botão de fechar, só existe no mobile — no desktop o menu nem
              tem como ser fechado, então não faz sentido mostrar. */}
          <button onClick={onMobileClose} className="md:hidden text-slate-300 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto py-4">
          {menu.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                className={`flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-p-primary text-white font-medium'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={logout}
          className="flex items-center gap-3 px-6 py-4 text-sm text-slate-300 hover:text-white border-t border-white/10 shrink-0"
        >
          <LogOut size={18} />
          Sair
        </button>
      </aside>
    </>
  );
}
