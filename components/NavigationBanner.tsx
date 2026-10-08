/**
 * NavigationBanner — immersive top navigation overlay for driver mode.
 *
 * Shows: turn icon + instruction, road name, distance to turn,
 * distance to destination, dynamic ETA, current speed.
 * Also shows a rerouting banner and an offline/weak-GPS warning.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TurnInstruction } from '@/lib/useNavigationEngine';
import type { ConnectionStatus } from '@/lib/useDriverTracking';

const C = {
  bg: 'rgba(10,10,10,0.95)',
  bgReroute: 'rgba(30,10,0,0.97)',
  bgArriving: 'rgba(5,20,10,0.97)',
  accent: '#1E88FF',
  green: '#22C55E',
  orange: '#F97316',
  red: '#EF4444',
  white: '#FFFFFF',
  textSub: '#9CA3AF',
};

interface NavigationBannerProps {
  isActive: boolean;                       // show the banner
  currentInstruction: TurnInstruction | null;
  nextInstruction: TurnInstruction | null;
  distanceToDestM: number;
  etaSeconds: number;
  speedMs: number;
  routeProgress: number;                   // 0–1
  isRerouting: boolean;
  rerouteReason: string | null;
  connectionStatus: ConnectionStatus;
  isNearingDestination: boolean;
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtDist(m: number): string {
  if (m < 100) return `${Math.round(m)} m`;
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtEta(secs: number): string {
  if (secs <= 0) return '—';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function fmtSpeed(ms: number): string {
  const kmh = Math.round(ms * 3.6);
  return `${kmh}`;
}

function etaArrival(secs: number): string {
  const d = new Date(Date.now() + secs * 1000);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m} ${ampm}`;
}

// ── Turn icon SVG paths (inline as text so it renders in React Native) ───────
// We encode turns as emoji-like text icons for simplicity

function TurnIcon({ type, size = 32 }: { type: string; size?: number }) {
  const map: Record<string, string> = {
    'turn-right':   '↱',
    'turn-left':    '↰',
    'slight-right': '⬈',
    'slight-left':  '⬉',
    'uturn':        '↩',
    'roundabout':   '↻',
    'arrive':       '⬤',
    'depart':       '▲',
    'continue':     '↑',
    'merge':        '↗',
  };
  const icon = map[type] ?? '↑';
  return (
    <Text style={{ fontSize: size, color: C.white, textAlign: 'center', lineHeight: size + 4 }}>
      {icon}
    </Text>
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.min(100, Math.max(0, progress * 100));
  return (
    <View style={s.progressTrack}>
      <View style={[s.progressFill, { width: `${pct}%` as any }]} />
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NavigationBanner({
  isActive,
  currentInstruction,
  nextInstruction,
  distanceToDestM,
  etaSeconds,
  speedMs,
  routeProgress,
  isRerouting,
  rerouteReason,
  connectionStatus,
  isNearingDestination,
}: NavigationBannerProps) {
  if (!isActive) return null;

  const bgColor = isRerouting ? C.bgReroute : isNearingDestination ? C.bgArriving : C.bg;

  return (
    <View style={s.root}>
      {/* ── Rerouting or connection banner ─────────────────────────────────── */}
      {(isRerouting || connectionStatus === 'reconnecting') && (
        <View style={s.alertStrip}>
          <Text style={s.alertText}>
            {isRerouting
              ? `${rerouteReason ?? 'Recalculating route'}…`
              : 'Reconnecting…'}
          </Text>
        </View>
      )}
      {connectionStatus === 'disconnected' && !isRerouting && (
        <View style={[s.alertStrip, { backgroundColor: '#1A0A00' }]}>
          <Text style={[s.alertText, { color: C.orange }]}>
            Offline navigation active
          </Text>
        </View>
      )}

      {/* ── Main instruction card ───────────────────────────────────────────── */}
      <View style={[s.card, { backgroundColor: bgColor }]}>
        {/* Turn icon + instruction */}
        <View style={s.instrRow}>
          <View style={[s.iconBox, isNearingDestination && { backgroundColor: '#0D2818' }]}>
            <TurnIcon type={currentInstruction?.type ?? 'continue'} size={28} />
          </View>

          <View style={s.instrText}>
            <Text style={s.instrMain} numberOfLines={1}>
              {currentInstruction?.text ?? 'Continue on route'}
            </Text>
            {(currentInstruction?.distanceM ?? 0) > 10 && (
              <Text style={s.instrDist}>
                {fmtDist(currentInstruction!.distanceM)}{currentInstruction?.subText ? ` · ${currentInstruction.subText}` : ''}
              </Text>
            )}
            {isNearingDestination && (
              <Text style={[s.instrDist, { color: C.green }]}>
                Approaching destination
              </Text>
            )}
          </View>

          {/* Speed chip */}
          <View style={s.speedChip}>
            <Text style={s.speedValue}>{fmtSpeed(speedMs)}</Text>
            <Text style={s.speedUnit}>km/h</Text>
          </View>
        </View>

        {/* ── Stats strip ─────────────────────────────────────────────────── */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statVal}>{fmtDist(distanceToDestM)}</Text>
            <Text style={s.statLbl}>Remaining</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statVal}>{fmtEta(etaSeconds)}</Text>
            <Text style={s.statLbl}>ETA</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={[s.statVal, { color: C.accent }]}>{etaArrival(etaSeconds)}</Text>
            <Text style={s.statLbl}>Arrival</Text>
          </View>
        </View>

        {/* ── Next turn preview ───────────────────────────────────────────── */}
        {nextInstruction && nextInstruction.distanceM > 200 && (
          <View style={s.nextRow}>
            <Text style={s.nextLabel}>Then: </Text>
            <TurnIcon type={nextInstruction.type} size={14} />
            <Text style={s.nextText}> {nextInstruction.text} in {fmtDist(nextInstruction.distanceM)}</Text>
          </View>
        )}

        {/* ── Progress bar ─────────────────────────────────────────────────── */}
        <ProgressBar progress={routeProgress} />
        <Text style={s.progressLabel}>{Math.round(routeProgress * 100)}% trip completed</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  alertStrip: {
    backgroundColor: '#1A1200',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  alertText: {
    color: C.orange,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  card: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  instrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#0D1A40',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  instrText: { flex: 1, gap: 2 },
  instrMain: {
    fontSize: 18,
    fontWeight: '800',
    color: C.white,
    letterSpacing: -0.3,
  },
  instrDist: {
    fontSize: 13,
    color: C.textSub,
    fontWeight: '500',
  },
  speedChip: {
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    flexShrink: 0,
  },
  speedValue: {
    fontSize: 18,
    fontWeight: '800',
    color: C.white,
    lineHeight: 20,
  },
  speedUnit: {
    fontSize: 9,
    color: C.textSub,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 10,
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  statDivider: { width: 1, height: 28, backgroundColor: '#2A2A2A' },
  statVal: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
  },
  statLbl: {
    fontSize: 9,
    color: C.textSub,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  nextLabel: { fontSize: 11, color: C.textSub, fontWeight: '500' },
  nextText:  { fontSize: 11, color: '#A0A0CC', fontWeight: '600' },
  progressTrack: {
    height: 3,
    backgroundColor: '#1E1E1E',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: C.green,
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 10,
    color: C.textSub,
    textAlign: 'right',
  },
});
