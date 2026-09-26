/**
 * SilhouetteGuide Component
 * Visual Patient Body Framing Silhouette Guide with real-time feedback:
 * - "Move farther away"
 * - "Move closer"
 * - "Center yourself"
 * - "Make sure your feet are visible"
 * - "Full body detected"
 */

import React from 'react';
import { 
  CheckCircle2, AlertTriangle, ArrowLeftRight, 
  ArrowDown, UserCheck, User, MoveHorizontal 
} from 'lucide-react';
import { FramingStatus, FramingFeedback } from '../core/PoseTypes';

export default function SilhouetteGuide({
  framing,
  isDemoMode = false,
  visible = true,
}) {

  if (!visible) return null;

  const status = framing?.status || (isDemoMode ? FramingStatus.FULL_BODY_DETECTED : FramingStatus.NO_PERSON);
  const feedback = framing?.feedback || FramingFeedback[status] || 'Position yourself in view';
  const isOptimallyFramed = framing?.isOptimallyFramed ?? isDemoMode;
  const score = framing?.score ?? (isDemoMode ? 100 : 0);

  // Status themes
  const getTheme = () => {
    switch (status) {
      case FramingStatus.FULL_BODY_DETECTED:
        return {
          stroke: '#10B981',
          fill: 'rgba(16, 185, 129, 0.08)',
          glow: 'rgba(16, 185, 129, 0.4)',
          badgeBg: 'rgba(16, 185, 129, 0.92)',
          textColor: '#FFFFFF',
          dash: 'none',
          icon: <CheckCircle2 size={16} />,
          subtext: 'Optimal distance and body positioning established',
        };
      case FramingStatus.FEET_NOT_VISIBLE:
        return {
          stroke: '#EF4444',
          fill: 'rgba(239, 68, 68, 0.06)',
          glow: 'rgba(239, 68, 68, 0.35)',
          badgeBg: 'rgba(239, 68, 68, 0.92)',
          textColor: '#FFFFFF',
          dash: '6 4',
          icon: <AlertTriangle size={16} />,
          subtext: 'Tilt camera downward or take a step back so shoes are visible',
        };
      case FramingStatus.MOVE_FARTHER:
        return {
          stroke: '#F59E0B',
          fill: 'rgba(245, 158, 11, 0.06)',
          glow: 'rgba(245, 158, 11, 0.35)',
          badgeBg: 'rgba(245, 158, 11, 0.92)',
          textColor: '#0F172A',
          dash: '6 4',
          icon: <ArrowLeftRight size={16} />,
          subtext: 'You are too close. Take 1-2 steps back from the camera',
        };
      case FramingStatus.MOVE_CLOSER:
        return {
          stroke: '#06B6D4',
          fill: 'rgba(6, 182, 212, 0.06)',
          glow: 'rgba(6, 182, 212, 0.35)',
          badgeBg: 'rgba(6, 182, 212, 0.92)',
          textColor: '#FFFFFF',
          dash: '6 4',
          icon: <MoveHorizontal size={16} />,
          subtext: 'You are too far. Step forward into the guide area',
        };
      case FramingStatus.CENTER_BODY:
        return {
          stroke: '#F59E0B',
          fill: 'rgba(245, 158, 11, 0.06)',
          glow: 'rgba(245, 158, 11, 0.35)',
          badgeBg: 'rgba(245, 158, 11, 0.92)',
          textColor: '#0F172A',
          dash: '6 4',
          icon: <MoveHorizontal size={16} />,
          subtext: 'Shift laterally toward the center axis',
        };
      default:
        return {
          stroke: 'rgba(148, 163, 184, 0.4)',
          fill: 'rgba(148, 163, 184, 0.03)',
          glow: 'none',
          badgeBg: 'rgba(15, 23, 42, 0.8)',
          textColor: '#E2E8F0',
          dash: '4 4',
          icon: <User size={16} />,
          subtext: 'Stand 5 to 7 feet from your webcam facing forward',
        };
    }
  };

  const theme = getTheme();

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 5,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px',
    }}>
      {/* SVG Target Humanoid Silhouette Guide */}
      <svg
        viewBox="0 0 400 500"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
        }}
      >
        <defs>
          <filter id="guide-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Ideal Humanoid Silhouette Wireframe (Normalized Center Box) */}
        <g stroke={theme.stroke} strokeWidth="2" strokeDasharray={theme.dash} filter="url(#guide-glow)">
          {/* Head Target Oval */}
          <ellipse
            cx="200"
            cy="70"
            rx="28"
            ry="36"
            fill={theme.fill}
          />

          {/* Neck */}
          <line x1="200" y1="106" x2="200" y2="124" />

          {/* Shoulders */}
          <line x1="140" y1="128" x2="260" y2="128" />

          {/* Torso Box */}
          <path
            d="M 140 128 L 155 240 L 245 240 L 260 128 Z"
            fill={theme.fill}
          />

          {/* Center Vertical Spine / Balance Axis */}
          <line
            x1="200"
            y1="50"
            x2="200"
            y2="430"
            stroke={theme.stroke}
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.6"
          />

          {/* Left Leg Guide */}
          <line x1="170" y1="240" x2="160" y2="340" />
          <line x1="160" y1="340" x2="160" y2="430" />

          {/* Right Leg Guide */}
          <line x1="230" y1="240" x2="240" y2="340" />
          <line x1="240" y1="340" x2="240" y2="430" />

          {/* Left Foot Target Zone */}
          <rect
            x="135"
            y="430"
            width="50"
            height="30"
            rx="6"
            fill={status === FramingStatus.FEET_NOT_VISIBLE ? 'rgba(239, 68, 68, 0.25)' : theme.fill}
            stroke={status === FramingStatus.FEET_NOT_VISIBLE ? '#EF4444' : theme.stroke}
            strokeWidth="2.5"
          />
          <text
            x="160"
            y="450"
            fill={theme.stroke}
            fontSize="10"
            fontWeight="700"
            textAnchor="middle"
          >
            L FOOT
          </text>

          {/* Right Foot Target Zone */}
          <rect
            x="215"
            y="430"
            width="50"
            height="30"
            rx="6"
            fill={status === FramingStatus.FEET_NOT_VISIBLE ? 'rgba(239, 68, 68, 0.25)' : theme.fill}
            stroke={status === FramingStatus.FEET_NOT_VISIBLE ? '#EF4444' : theme.stroke}
            strokeWidth="2.5"
          />
          <text
            x="240"
            y="450"
            fill={theme.stroke}
            fontSize="10"
            fontWeight="700"
            textAnchor="middle"
          >
            R FOOT
          </text>
        </g>

        {/* Warning Arrows when feet are occluded */}
        {status === FramingStatus.FEET_NOT_VISIBLE && (
          <g stroke="#EF4444" strokeWidth="2.5" fill="none">
            <path d="M 160 395 L 160 418 M 154 412 L 160 418 L 166 412" />
            <path d="M 240 395 L 240 418 M 234 412 L 240 418 L 246 412" />
          </g>
        )}
      </svg>

      {/* Dynamic Framing Guidance Floating Banner */}
      <div style={{
        marginTop: '8px',
        backgroundColor: theme.badgeBg,
        color: theme.textColor,
        padding: '5px 14px',
        borderRadius: '999px',
        boxShadow: `0 4px 14px ${theme.glow}`,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        fontWeight: 800,
        letterSpacing: '0.03em',
        transition: 'all 0.2s ease',
        transform: isOptimallyFramed ? 'scale(1.02)' : 'scale(1)',
        zIndex: 10,
      }}>
        {theme.icon}
        <span>{feedback.toUpperCase()}</span>
      </div>

      {/* Subtitle Hint at bottom */}
      <div style={{
        marginBottom: '10px',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        border: `1px solid ${theme.stroke}`,
        color: '#E2E8F0',
        padding: '3px 12px',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 600,
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        zIndex: 10,
      }}>
        <span>{theme.subtext}</span>
        <div style={{
          width: '36px',
          height: '4px',
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: '2px',
          overflow: 'hidden',
          marginLeft: '4px',
        }}>
          <div style={{
            width: `${score}%`,
            height: '100%',
            backgroundColor: theme.stroke,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
    </div>
  );
}

