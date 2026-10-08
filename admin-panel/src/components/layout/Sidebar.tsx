import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, Car, CreditCard, ShieldAlert, Tag, Settings,
  BarChart3, ScrollText, LogOut, ChevronLeft, ChevronRight, Bell, UserCheck,
  HelpCircle, MessageSquare, Star, Truck, Bell as BellRing, Map,
  DollarSign, ShieldOff, FlaskConical, Flag, Activity, Webhook,
  Brain, Siren, Scale, Radar, GraduationCap, Building2, Shield,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useRole } from '@/hooks/usePermissions';
import { canAccessRoute } from '@shared/adminRbac';
import { clsx } from 'clsx';

const navGroups = [
  {
    label: 'Core',
    items: [
      { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/marketplace', icon: Radar,           label: 'Marketplace' },
      { to: '/universities', icon: GraduationCap, label: 'Universities' },
      { to: '/corporate',    icon: Building2,     label: 'Corporate' },
      { to: '/messages',   icon: MessageSquare,   label: 'Messages' },
      { to: '/live-map',   icon: Map,             label: 'Live Map' },
      { to: '/incidents',  icon: Siren,           label: 'Incidents' },
    ],
  },
  {
    label: 'Users & Drivers',
    items: [
      { to: '/users',               icon: Users,     label: 'Users' },
      { to: '/passengers',          icon: Users,     label: 'Passengers' },
      { to: '/drivers',             icon: Truck,     label: 'Drivers' },
      { to: '/driver-applications', icon: UserCheck, label: 'Driver Apps' },
      { to: '/driver-intelligence', icon: Brain,     label: 'Driver Intel' },
      { to: '/user-intelligence',   icon: BarChart3, label: 'User Intel' },
      { to: '/ratings',             icon: Star,      label: 'Ratings' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/rides',          icon: Car,        label: 'Rides' },
      { to: '/payments',       icon: CreditCard, label: 'Payments' },
      { to: '/finance',        icon: DollarSign, label: 'Finance' },
      { to: '/pricing-rules',  icon: Tag,        label: 'Pricing Rules' },
      { to: '/fraud',          icon: ShieldOff,  label: 'Fraud Intel' },
      { to: '/safety',         icon: ShieldAlert,label: 'Safety Ops' },
      { to: '/promos',         icon: Tag,        label: 'Promos' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/feature-flags', icon: Flag,         label: 'Feature Flags' },
      { to: '/ab-tests',      icon: FlaskConical, label: 'A/B Tests' },
      { to: '/webhooks',      icon: Webhook,      label: 'Webhooks' },
      { to: '/infra-health',  icon: Activity,     label: 'Infra Health' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/notifications',  icon: Bell,       label: 'Notifications' },
      { to: '/operations',     icon: Settings,   label: 'Operations' },
      { to: '/analytics',      icon: BarChart3,  label: 'Analytics' },
      { to: '/alert-rules',    icon: BellRing,   label: 'Alert Engine' },
      { to: '/audit-logs',     icon: ScrollText, label: 'Audit Logs' },
      { to: '/legal-compliance', icon: Scale,    label: 'Legal Compliance' },
      { to: '/support',        icon: HelpCircle, label: 'Support' },
      { to: '/admin-roles',    icon: Shield,     label: 'Department Roles', superAdminOnly: true },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuthStore();
  const role = useRole();

  const visibleGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if ('superAdminOnly' in item && item.superAdminOnly) return role === 'super_admin';
      return canAccessRoute(role ?? undefined, item.to);
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className={clsx(
      'h-screen sticky top-0 flex flex-col bg-slate-900 border-r border-slate-700/50 transition-all duration-300',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-slate-700/50">
        <span className="text-2xl">🚗</span>
        {!collapsed && <span className="font-bold text-white text-lg">YOO Admin</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-4">
        {visibleGroups.map(group => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-3 mb-1">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => clsx(
                    'flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium',
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-500'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  )}
                >
                  <Icon size={18} />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-slate-700/50 p-3">
        {!collapsed && user && (
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
              {user.name?.[0] || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-slate-400 capitalize">{user.role?.replace('_', ' ')}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={logout}
            className="flex items-center gap-2 text-slate-400 hover:text-red-400 text-sm px-2 py-1.5 rounded hover:bg-slate-800 transition-colors flex-1"
          >
            <LogOut size={16} />
            {!collapsed && 'Logout'}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-800"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
