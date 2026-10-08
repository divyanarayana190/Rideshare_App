/**
 * useVoiceNavigation — speaks turn-by-turn instructions.
 * Uses Web Speech API on web, expo-speech on native.
 * Announces: route start, upcoming turns, off-route, arrival.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { TurnInstruction } from './useNavigationEngine';

let Speech: { speak: (text: string, opts?: object) => void } | null = null;
if (Platform.OS !== 'web') {
  try { Speech = require('expo-speech'); } catch { /* not available */ }
}

function speak(text: string) {
  if (!text) return;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1.0;
    u.volume = 1.0;
    // Prefer a clear English voice
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find((v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('google'))
      ?? voices.find((v) => v.lang.startsWith('en'))
      ?? null;
    if (en) u.voice = en;
    window.speechSynthesis.speak(u);
  } else if (Speech) {
    Speech.speak(text, { language: 'en-US', rate: 1.0, pitch: 1.0 });
  }
}

function fmtDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} kilometers`;
  if (m >= 100) return `${Math.round(m / 100) * 100} meters`;
  return `${Math.round(m / 50) * 50} meters`;
}

interface VoiceNavOptions {
  enabled: boolean;
  currentInstruction: TurnInstruction | null;
  isOffRoute: boolean;
  isRerouting: boolean;
  isNearingDestination: boolean;
  distanceToDestM: number;
  routeStarted: boolean;   // true once driver starts moving (speed > 0)
}

export function useVoiceNavigation({
  enabled,
  currentInstruction,
  isOffRoute,
  isRerouting,
  isNearingDestination,
  distanceToDestM,
  routeStarted,
}: VoiceNavOptions) {
  const lastInstrRef   = useRef<string | null>(null);
  const lastOffRef     = useRef(false);
  const lastRerouteRef = useRef(false);
  const lastNearRef    = useRef(false);
  const announcedRef   = useRef<Set<string>>(new Set()); // distance thresholds announced
  const spokenStartRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // ── First instruction on route start ──────────────────────────────────
    if (routeStarted && currentInstruction && !spokenStartRef.current) {
      spokenStartRef.current = true;
      const dist = fmtDist(currentInstruction.distanceM);
      const sub  = currentInstruction.subText ? ` ${currentInstruction.subText}` : '';
      speak(`${currentInstruction.text}${sub} in ${dist}`);
      return;
    }

    // ── Off-route alert ───────────────────────────────────────────────────
    if (isOffRoute && !lastOffRef.current) {
      lastOffRef.current = true;
      speak('You are off route. Recalculating…');
      return;
    }
    if (!isOffRoute) lastOffRef.current = false;

    // ── Reroute complete ──────────────────────────────────────────────────
    if (!isRerouting && lastRerouteRef.current) {
      lastRerouteRef.current = false;
      if (currentInstruction) {
        const sub = currentInstruction.subText ? ` ${currentInstruction.subText}` : '';
        speak(`Route updated. ${currentInstruction.text}${sub}`);
      }
      return;
    }
    if (isRerouting) lastRerouteRef.current = true;

    // ── Turn instruction changes ──────────────────────────────────────────
    if (currentInstruction) {
      const key = `${currentInstruction.text}|${Math.round(currentInstruction.distanceM / 100)}`;
      if (key !== lastInstrRef.current) {
        lastInstrRef.current = key;

        const dm = currentInstruction.distanceM;
        const sub = currentInstruction.subText ? ` ${currentInstruction.subText}` : '';

        // Announce at ~500m, ~200m, and at the turn
        if (dm < 50) {
          speak(`${currentInstruction.text}${sub}`);
        } else if (dm < 220 && !announcedRef.current.has(`200|${key}`)) {
          announcedRef.current.add(`200|${key}`);
          speak(`In ${fmtDist(dm)}, ${currentInstruction.text.toLowerCase()}${sub}`);
        } else if (dm < 520 && !announcedRef.current.has(`500|${key}`)) {
          announcedRef.current.add(`500|${key}`);
          speak(`In ${fmtDist(dm)}, ${currentInstruction.text.toLowerCase()}${sub}`);
        }
      }
    }

    // ── Nearing destination ───────────────────────────────────────────────
    if (isNearingDestination && !lastNearRef.current) {
      lastNearRef.current = true;
      speak('Approaching your destination. Prepare to complete the ride.');
      return;
    }
    if (!isNearingDestination) lastNearRef.current = false;

    // ── ~1km out ──────────────────────────────────────────────────────────
    if (distanceToDestM < 1100 && distanceToDestM > 800 && !announcedRef.current.has('1km')) {
      announcedRef.current.add('1km');
      speak('Your destination is about 1 kilometer ahead.');
    }

  }, [enabled, currentInstruction, isOffRoute, isRerouting, isNearingDestination, distanceToDestM, routeStarted]);

  // Reset when navigation restarts
  useEffect(() => {
    spokenStartRef.current = false;
    announcedRef.current   = new Set();
    lastInstrRef.current   = null;
    lastNearRef.current    = false;
  }, [enabled]);
}
