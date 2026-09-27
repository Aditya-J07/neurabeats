/**
 * AudioStatus Component
 * Displays microphone sensing activity, audio levels, and rhythmic synchronization error.
 */

import React from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';

export default function AudioStatus({
  level = 0,
  activity = false,
  timingErrorMs = 0,
  isListening = true,
}) {
  const clampedLevel = Math.max(0, Math.min(1, level));

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#F8FAFC',
      padding: '10px 16px',
      borderRadius: '10px',
      border: '1px solid #E2E8F0',
      fontSize: '12px',
      color: '#475569',
      marginTop: '8px',
    }}>
      {/* Microphone status and level meter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isListening ? (
          <Mic size={16} color={activity ? '#10B981' : '#64748B'} />
        ) : (
          <MicOff size={16} color="#94A3B8" />
        )}
        <span style={{ fontWeight: 600 }}>Mic Sensing:</span>
        <div style={{
          width: '70px',
          height: '6px',
          backgroundColor: '#E2E8F0',
          borderRadius: '999px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${clampedLevel * 100}%`,
            height: '100%',
            backgroundColor: activity ? '#10B981' : '#3B82F6',
            transition: 'width 0.1s ease',
          }} />
        </div>
        <span style={{
          fontSize: '11px',
          color: activity ? '#10B981' : '#94A3B8',
          fontWeight: 700,
        }}>
          {activity ? 'AUDIO ACTIVE' : 'QUIET'}
        </span>
      </div>

      {/* Multimodal Sync Timing Alignment */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: '#64748B' }}>Sync Offset:</span>
        <span style={{
          fontWeight: 800,
          color: timingErrorMs < 50 ? '#10B981' : timingErrorMs < 120 ? '#F59E0B' : '#EF4444',
        }}>
          {timingErrorMs > 0 ? `${timingErrorMs}ms` : '0ms (Locked)'}
        </span>
      </div>
    </div>
  );
}
